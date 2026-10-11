import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  getDocs,
  writeBatch,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import {
  getDailyPlanDocRef,
  getUserDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  getFirebaseApp,
  handleFirestoreError,
  OperationType,
  sanitizeForFirestore,
} from "@/lib/firebase";
import type { SavedDailyPlan, ScheduleBlock, PlanPreferences } from "@/lib/firebase/types";

function normalizeDateStr(rawDate?: string): string {
  if (!rawDate) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }
  const match = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(rawDate);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return rawDate;
}

function getLocalKey(uid: string, date: string): string {
  return `deadlineiq_plan_${uid}_${normalizeDateStr(date)}`;
}

export function saveLocalPlan(uid: string, plan: SavedDailyPlan): void {
  try {
    const normDate = normalizeDateStr(plan.date || plan.id);
    localStorage.setItem(getLocalKey(uid, normDate), JSON.stringify(plan));
  } catch {}
}

export function loadLocalPlan(uid: string, date: string): SavedDailyPlan | null {
  try {
    const normDate = normalizeDateStr(date);
    const raw = localStorage.getItem(getLocalKey(uid, normDate));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function removeLocalPlan(uid: string, date: string): void {
  try {
    const normDate = normalizeDateStr(date);
    localStorage.removeItem(getLocalKey(uid, normDate));
  } catch {}
}

export function clearLocalPlans(uid: string): void {
  try {
    const prefix = `deadlineiq_plan_${uid}`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(prefix) || key.includes(`_plan_${uid}_`))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/**
 * Saves a generated or edited daily plan for the authenticated user in Firestore.
 */
export async function saveDailyPlan(
  uid: string,
  plan: SavedDailyPlan,
  actionByUid = uid
): Promise<void> {
  const normDate = normalizeDateStr(plan.date || plan.id);
  const normalizedPlan: SavedDailyPlan = {
    ...plan,
    id: normDate,
    planId: normDate,
    date: normDate,
  };

  // Always save locally first for resilience
  saveLocalPlan(uid, normalizedPlan);

  // If this is an explicit demo session without Firebase Auth, return gracefully
  if (uid && uid.startsWith("demo-")) {
    return;
  }

  // 4. VERIFY THE AUTHENTICATED USER (Part 3)
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw new Error("Your session has expired. Please sign in again to save your plan.");
  }

  // Use the Firebase Authentication user's actual UID - do not trust client-supplied UID
  const authenticatedUid = currentUser.uid;

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore database service is not available.");
  }

  // Path: users/{authenticatedUser.uid}/dailyPlans/{YYYY-MM-DD}
  const planDocPath = `users/${authenticatedUid}/dailyPlans/${normDate}`;
  const planRef = doc(db, "users", authenticatedUid, "dailyPlans", normDate);

  // PART 2 & PART 4: Log in development only
  if (import.meta.env.DEV) {
    const app = getFirebaseApp();
    console.log("[Firestore Save Plan Diagnostics]", {
      projectId: app?.options?.projectId || "deadlineiq-3a3b5",
      databaseId: "(default)",
      authenticatedUid: authenticatedUid,
      documentPath: planDocPath,
      operationType: "write",
    });

    // PART 6: Test minimal write to separate auth/config from serialization
    try {
      const minimalDoc = {
        date: normDate,
        testWrite: true,
      };
      await setDoc(planRef, minimalDoc, { merge: true });
      console.log("[Firestore Save Plan Diagnostics] Minimal write to Firestore succeeded on path:", planDocPath);
    } catch (minErr) {
      console.warn("[Firestore Save Plan Diagnostics] Minimal write to primary path dailyPlans failed (live rules in Firebase Console require dailyPlans match):", minErr);
    }
  }

  // 10. SAVE EXACTLY THIS KIND OF DATA
  const cleanBlocks = (normalizedPlan.blocks || []).map((b, idx) => ({
    id: b.id || `block-${idx}-${Date.now()}`,
    title: b.title || b.activity || "Scheduled Task",
    activity: b.activity || b.title || "Scheduled Task",
    description: b.description || b.reason || null,
    reason: b.reason || b.description || null,
    subject: b.subject || null,
    startTime: b.startTime,
    endTime: b.endTime,
    type: b.type || "task",
    priority: b.priority || "MEDIUM",
    deadlineId: b.deadlineId || null,
    location: b.location || null,
    completed: Boolean(b.completed ?? b.isCompleted),
    isCompleted: Boolean(b.completed ?? b.isCompleted),
    isAiRecommendation: Boolean(b.isAiRecommendation),
  }));

  const cleanPlanDoc = sanitizeForFirestore({
    id: normDate,
    planId: normDate,
    userId: authenticatedUid,
    date: normDate,
    timezone: normalizedPlan.timezone || (typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
    planningStart: normalizedPlan.planningStart || normalizedPlan.preferences?.startTime || "00:00",
    planningEnd: normalizedPlan.planningEnd || normalizedPlan.preferences?.endTime || "23:59",
    preferences: normalizedPlan.preferences || null,
    blocks: cleanBlocks,
    createdAt: normalizedPlan.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Attempt primary write to users/{authenticatedUid}/dailyPlans/{normDate}
  let savedToFirestore = false;

  // Persist to user document root
  const userDocRef = getUserDocRef(authenticatedUid);
  if (userDocRef) {
    try {
      await setDoc(
        userDocRef,
        sanitizeForFirestore({
          [`dailyPlan_${normDate}`]: cleanPlanDoc,
          todayPlan: cleanPlanDoc,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
      savedToFirestore = true;
      saveLocalPlan(authenticatedUid, cleanPlanDoc as SavedDailyPlan);
      console.log(`[FIRESTORE WRITE]\nfeature: dailyPlans\nuid: ${authenticatedUid}\npath: users/${authenticatedUid}\ndocumentId: dailyPlan_${normDate}\nsuccess: true`);
    } catch (uErr) {
      console.warn(`[FIRESTORE WRITE]\nfeature: dailyPlans user doc warning:`, uErr);
    }
  }

  try {
    await setDoc(planRef, cleanPlanDoc, { merge: true });
    savedToFirestore = true;
    saveLocalPlan(authenticatedUid, cleanPlanDoc as SavedDailyPlan);
    console.log(`[FIRESTORE WRITE]\nfeature: dailyPlans\nuid: ${authenticatedUid}\npath: ${planDocPath}\ndocumentId: ${normDate}\nsuccess: true`);
  } catch (err) {
    // Fallback: Write to users/{authenticatedUid}/settings/dailyPlan_{normDate}
    try {
      const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
      await setDoc(fallbackRef, cleanPlanDoc, { merge: true });
      savedToFirestore = true;
      saveLocalPlan(authenticatedUid, cleanPlanDoc as SavedDailyPlan);
      console.log(`[FIRESTORE WRITE]\nfeature: dailyPlans (fallback)\nuid: ${authenticatedUid}\npath: ${fallbackRef.path}\ndocumentId: dailyPlan_${normDate}\nsuccess: true`);
    } catch (fallbackErr) {
      if (!savedToFirestore) {
        console.error(`[FIRESTORE WRITE]\nfeature: dailyPlans\nuid: ${authenticatedUid}\npath: ${planDocPath}\ndocumentId: ${normDate}\nsuccess: false`, err);
        handleFirestoreError(err, OperationType.WRITE, planDocPath, currentUser);
      }
    }
  }
}

/**
 * Retrieves the daily plan for a specific date.
 */
export async function getDailyPlan(
  uid: string,
  date: string,
  actionByUid = uid
): Promise<SavedDailyPlan | null> {
  const normDate = normalizeDateStr(date);

  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser || uid.startsWith("demo-")) {
    return loadLocalPlan(uid, normDate);
  }

  const authenticatedUid = currentUser.uid;
  const db = getFirebaseDb();
  if (!db) {
    return loadLocalPlan(authenticatedUid, normDate);
  }

  const planRef = doc(db, "users", authenticatedUid, "dailyPlans", normDate);

  try {
    const snap = await getDoc(planRef);
    if (snap.exists()) {
      const data = snap.data() as SavedDailyPlan;
      saveLocalPlan(authenticatedUid, data);
      console.log(`[FIRESTORE READ]\nfeature: dailyPlans\nuid: ${authenticatedUid}\npath: users/${authenticatedUid}/dailyPlans/${normDate}\ndocumentsFound: 1`);
      return data;
    }
    // Check fallback settings subcollection
    const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
    const fallbackSnap = await getDoc(fallbackRef);
    if (fallbackSnap.exists()) {
      const data = fallbackSnap.data() as SavedDailyPlan;
      saveLocalPlan(authenticatedUid, data);
      console.log(`[FIRESTORE READ]\nfeature: dailyPlans (fallback)\nuid: ${authenticatedUid}\npath: ${fallbackRef.path}\ndocumentsFound: 1`);
      return data;
    }
    // Check user document root
    const userDocRef = getUserDocRef(authenticatedUid);
    if (userDocRef) {
      const uSnap = await getDoc(userDocRef);
      if (uSnap.exists()) {
        const uData = uSnap.data();
        const candidate = uData?.[`dailyPlan_${normDate}`] || (uData?.todayPlan?.date === normDate ? uData.todayPlan : null);
        if (candidate) {
          saveLocalPlan(authenticatedUid, candidate);
          console.log(`[FIRESTORE READ]\nfeature: dailyPlans (user doc)\nuid: ${authenticatedUid}\npath: users/${authenticatedUid}\ndocumentsFound: 1`);
          return candidate as SavedDailyPlan;
        }
      }
    }
    // If not found in Firestore, do NOT resurrect stale plan from localStorage.
    removeLocalPlan(authenticatedUid, normDate);
    console.log(`[FIRESTORE READ]\nfeature: dailyPlans\nuid: ${authenticatedUid}\npath: users/${authenticatedUid}/dailyPlans/${normDate}\ndocumentsFound: 0`);
    return null;
  } catch (err) {
    console.warn(`[FIRESTORE READ FAILED]\nfeature: dailyPlans\nuid: ${authenticatedUid}\npath: users/${authenticatedUid}/dailyPlans/${normDate}`, err);
    return null;
  }
}

/**
 * Subscribes to real-time changes of the user's daily plan for a given date.
 */
export function subscribeToDailyPlan(
  uid: string,
  date: string,
  callback: (plan: SavedDailyPlan | null) => void,
  actionByUid = uid
): () => void {
  const normDate = normalizeDateStr(date);
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser || uid.startsWith("demo-")) {
    const local = loadLocalPlan(uid, normDate);
    callback(local);
    return () => {};
  }

  const authenticatedUid = currentUser.uid;
  const db = getFirebaseDb();
  if (!db) {
    const local = loadLocalPlan(authenticatedUid, normDate);
    callback(local);
    return () => {};
  }

  const planRef = doc(db, "users", authenticatedUid, "dailyPlans", normDate);

  const unsubscribePrimary = onSnapshot(
    planRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const plan = snapshot.data() as SavedDailyPlan;
        saveLocalPlan(authenticatedUid, plan);
        callback(plan);
      } else {
        // Check fallback settings path
        const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
        getDoc(fallbackRef)
          .then((fSnap) => {
            if (fSnap.exists()) {
              const plan = fSnap.data() as SavedDailyPlan;
              saveLocalPlan(authenticatedUid, plan);
              callback(plan);
            } else {
              // Check user root document
              const userDocRef = getUserDocRef(authenticatedUid);
              if (userDocRef) {
                getDoc(userDocRef)
                  .then((uSnap) => {
                    if (uSnap.exists()) {
                      const uData = uSnap.data();
                      const candidate =
                        uData?.[`dailyPlan_${normDate}`] ||
                        (uData?.todayPlan?.date === normDate ? uData.todayPlan : null);
                      if (candidate) {
                        saveLocalPlan(authenticatedUid, candidate);
                        callback(candidate as SavedDailyPlan);
                        return;
                      }
                    }
                    removeLocalPlan(authenticatedUid, normDate);
                    callback(null);
                  })
                  .catch(() => {
                    removeLocalPlan(authenticatedUid, normDate);
                    callback(null);
                  });
              } else {
                removeLocalPlan(authenticatedUid, normDate);
                callback(null);
              }
            }
          })
          .catch(() => {
            removeLocalPlan(authenticatedUid, normDate);
            callback(null);
          });
      }
    },
    (error) => {
      console.warn("DailyPlan onSnapshot primary error:", error);
      callback(null);
    }
  );

  return () => {
    unsubscribePrimary();
  };
}

/**
 * Permanently removes a single saved daily plan for a given date across all locations.
 */
export async function deleteDailyPlan(uid: string, date: string): Promise<void> {
  const normDate = normalizeDateStr(date);
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser && (!uid || !uid.startsWith("demo-"))) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const authenticatedUid = currentUser?.uid || uid;
  removeLocalPlan(authenticatedUid, normDate);

  if (authenticatedUid.startsWith("demo-")) {
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;

  // 1. Delete from users/{authenticatedUid}/dailyPlans/{normDate}
  try {
    const planRef = doc(db, "users", authenticatedUid, "dailyPlans", normDate);
    await deleteDoc(planRef);
    console.log(`[FIRESTORE WRITE]\nfeature: dailyPlans\nuid: ${authenticatedUid}\noperation: deleteDoc\ndocId: ${normDate}\nsuccess: true`);
  } catch (err) {
    console.warn("Error deleting dailyPlan doc:", err);
  }

  // 2. Delete from users/{authenticatedUid}/settings/dailyPlan_{normDate}
  try {
    const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
    await deleteDoc(fallbackRef);
  } catch {}

  // 3. Remove field from user root document
  try {
    const userDocRef = getUserDocRef(authenticatedUid);
    if (userDocRef) {
      const uSnap = await getDoc(userDocRef);
      if (uSnap.exists()) {
        const uData = uSnap.data();
        const updates: Record<string, any> = {};
        if (uData?.[`dailyPlan_${normDate}`] !== undefined) {
          updates[`dailyPlan_${normDate}`] = deleteField();
        }
        if (uData?.todayPlan?.date === normDate) {
          updates.todayPlan = deleteField();
        }
        if (Object.keys(updates).length > 0) {
          await updateDoc(userDocRef, updates);
        }
      }
    }
  } catch {}

  removeLocalPlan(authenticatedUid, normDate);
}

/**
 * Deletes all saved Plan My Day documents belonging to the authenticated user's UID.
 * Completely purges all stored plans across:
 * - users/{authenticatedUid}/dailyPlans (all plan documents)
 * - users/{authenticatedUid}/settings (all dailyPlan_* documents)
 * - users/{authenticatedUid} (removes todayPlan and dailyPlan_* fields)
 * - Local storage cache
 */
export async function clearAllDailyPlans(
  uid: string
): Promise<{ success: boolean; deletedCount: number }> {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser && (!uid || !uid.startsWith("demo-"))) {
    throw new Error("Your session has expired. Please sign in again to clear plans.");
  }

  const authenticatedUid = currentUser?.uid || uid;

  // 1. Immediately wipe local storage cache so it cannot resurrect
  clearLocalPlans(authenticatedUid);

  if (authenticatedUid.startsWith("demo-")) {
    return { success: true, deletedCount: 1 };
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore database service is not available.");
  }

  let totalDeleted = 0;

  try {
    // 2. Query and delete all documents in users/{authenticatedUid}/dailyPlans
    const dailyPlansCol = collection(db, "users", authenticatedUid, "dailyPlans");
    const dailyPlansSnap = await getDocs(dailyPlansCol);

    if (!dailyPlansSnap.empty) {
      const docs = dailyPlansSnap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 400);
        for (const docSnap of chunk) {
          batch.delete(docSnap.ref);
          totalDeleted++;
        }
        await batch.commit();
      }
      console.log(`[FIRESTORE WRITE]\nfeature: dailyPlans\nuid: ${authenticatedUid}\noperation: clearAll batch delete\ncount: ${totalDeleted}\nsuccess: true`);
    }

    // 3. Query and delete all daily plan documents in users/{authenticatedUid}/settings
    try {
      const settingsCol = collection(db, "users", authenticatedUid, "settings");
      const settingsSnap = await getDocs(settingsCol);
      if (!settingsSnap.empty) {
        const planSettingsDocs = settingsSnap.docs.filter(
          (d) => d.id.startsWith("dailyPlan_") || d.id === "todayPlan"
        );
        if (planSettingsDocs.length > 0) {
          for (let i = 0; i < planSettingsDocs.length; i += 400) {
            const batch = writeBatch(db);
            const chunk = planSettingsDocs.slice(i, i + 400);
            for (const docSnap of chunk) {
              batch.delete(docSnap.ref);
            }
            await batch.commit();
          }
          console.log(`[FIRESTORE WRITE]\nfeature: dailyPlans settings fallback\nuid: ${authenticatedUid}\noperation: clearAll batch delete\ncount: ${planSettingsDocs.length}\nsuccess: true`);
        }
      }
    } catch (settingsErr) {
      console.warn("Could not delete settings fallback plans:", settingsErr);
    }

    // 4. Clean up user root document fields (`todayPlan`, `dailyPlan_*`)
    const userDocRef = getUserDocRef(authenticatedUid);
    if (userDocRef) {
      try {
        const uSnap = await getDoc(userDocRef);
        if (uSnap.exists()) {
          const uData = uSnap.data();
          const updates: Record<string, any> = {};
          if (uData.todayPlan !== undefined) {
            updates.todayPlan = deleteField();
          }
          for (const key of Object.keys(uData)) {
            if (key.startsWith("dailyPlan_")) {
              updates[key] = deleteField();
            }
          }
          if (Object.keys(updates).length > 0) {
            await updateDoc(userDocRef, updates);
            console.log(`[FIRESTORE WRITE]\nfeature: user root doc dailyPlan fields\nuid: ${authenticatedUid}\noperation: deleteField\nkeys:`, Object.keys(updates));
          }
        }
      } catch (uErr) {
        console.warn("Could not remove dailyPlan fields from user document:", uErr);
      }
    }

    // Ensure local storage is completely cleared
    clearLocalPlans(authenticatedUid);

    return { success: true, deletedCount: totalDeleted };
  } catch (error: any) {
    console.error(`[FIRESTORE DELETE FAILED]\nfeature: dailyPlans\nuid: ${authenticatedUid}`, error);
    const authUser = currentUser ? { uid: currentUser.uid, email: currentUser.email } : undefined;
    handleFirestoreError(error, OperationType.DELETE, `users/${authenticatedUid}/dailyPlans`, authUser);
    throw error;
  }
}

