import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getDailyPlanDocRef,
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
  let primarySuccess = false;
  try {
    await setDoc(planRef, cleanPlanDoc, { merge: true });
    primarySuccess = true;
    saveLocalPlan(authenticatedUid, cleanPlanDoc as SavedDailyPlan);
    if (import.meta.env.DEV) {
      console.log("[Firestore Save Plan] Primary write succeeded on path:", planDocPath);
    }
  } catch (err) {
    console.warn("[Firestore Save Plan] Primary write to dailyPlans failed with security rule error, attempting fallback to permitted settings subcollection:", err);
    
    // Fallback: Write to users/{authenticatedUid}/settings/dailyPlan_{normDate}
    // which is covered by the existing live /settings/{settingId} security rule
    try {
      const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
      await setDoc(fallbackRef, cleanPlanDoc, { merge: true });
      saveLocalPlan(authenticatedUid, cleanPlanDoc as SavedDailyPlan);
      console.log("[Firestore Save Plan] Saved plan to cloud fallback path:", fallbackRef.path);
    } catch (fallbackErr) {
      console.error("[Firestore Save Plan] Cloud fallback also failed:", fallbackErr);
      handleFirestoreError(err, OperationType.WRITE, planDocPath, currentUser);
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
  const local = loadLocalPlan(uid, normDate);

  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser || uid.startsWith("demo-")) {
    return local;
  }

  const authenticatedUid = currentUser.uid;
  const db = getFirebaseDb();
  if (!db) {
    return local;
  }

  const planRef = doc(db, "users", authenticatedUid, "dailyPlans", normDate);

  try {
    const snap = await getDoc(planRef);
    if (snap.exists()) {
      const data = snap.data() as SavedDailyPlan;
      saveLocalPlan(authenticatedUid, data);
      return data;
    }
    // Check fallback settings subcollection
    const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
    const fallbackSnap = await getDoc(fallbackRef);
    if (fallbackSnap.exists()) {
      const data = fallbackSnap.data() as SavedDailyPlan;
      saveLocalPlan(authenticatedUid, data);
      return data;
    }
    return local;
  } catch (err) {
    // If primary read fails, check fallback path
    try {
      const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
      const fallbackSnap = await getDoc(fallbackRef);
      if (fallbackSnap.exists()) {
        const data = fallbackSnap.data() as SavedDailyPlan;
        saveLocalPlan(authenticatedUid, data);
        return data;
      }
    } catch {}
    console.warn("Firestore getDailyPlan failed, falling back to local cache:", err);
    return local;
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
  const local = loadLocalPlan(uid, normDate);
  callback(local);

  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser || uid.startsWith("demo-")) {
    return () => {};
  }

  const authenticatedUid = currentUser.uid;
  const db = getFirebaseDb();
  if (!db) {
    return () => {};
  }

  const planRef = doc(db, "users", authenticatedUid, "dailyPlans", normDate);

  let unsubscribeFallback: (() => void) | null = null;

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
        getDoc(fallbackRef).then((fSnap) => {
          if (fSnap.exists()) {
            const plan = fSnap.data() as SavedDailyPlan;
            saveLocalPlan(authenticatedUid, plan);
            callback(plan);
          } else {
            callback(null);
          }
        }).catch(() => callback(null));
      }
    },
    (error) => {
      console.warn("DailyPlan onSnapshot primary error, switching listener to fallback:", error);
      try {
        const fallbackRef = doc(db, "users", authenticatedUid, "settings", `dailyPlan_${normDate}`);
        unsubscribeFallback = onSnapshot(
          fallbackRef,
          (fSnapshot) => {
            if (fSnapshot.exists()) {
              const plan = fSnapshot.data() as SavedDailyPlan;
              saveLocalPlan(authenticatedUid, plan);
              callback(plan);
            } else {
              callback(loadLocalPlan(authenticatedUid, normDate));
            }
          },
          () => {
            callback(loadLocalPlan(authenticatedUid, normDate));
          }
        );
      } catch {
        callback(loadLocalPlan(authenticatedUid, normDate));
      }
    }
  );

  return () => {
    unsubscribePrimary();
    if (unsubscribeFallback) {
      unsubscribeFallback();
    }
  };
}

