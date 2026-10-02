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
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import type { SavedDailyPlan, ScheduleBlock, PlanPreferences } from "@/lib/firebase/types";

function isFirebaseAuthForUid(uid: string): boolean {
  if (!uid || uid.startsWith("demo-")) return false;
  const auth = getFirebaseAuth();
  return Boolean(auth?.currentUser && auth.currentUser.uid === uid);
}

function getLocalKey(uid: string, date: string): string {
  return `deadlineiq_plan_${uid}_${date}`;
}

export function saveLocalPlan(uid: string, plan: SavedDailyPlan): void {
  try {
    localStorage.setItem(getLocalKey(uid, plan.date), JSON.stringify(plan));
  } catch {}
}

export function loadLocalPlan(uid: string, date: string): SavedDailyPlan | null {
  try {
    const raw = localStorage.getItem(getLocalKey(uid, date));
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
  saveLocalPlan(uid, plan);

  if (!isFirebaseAuthForUid(uid)) {
    return;
  }

  const db = getFirebaseDb();
  const planRef = uid ? getDailyPlanDocRef(uid, plan.date) : null;
  if (!db || !planRef) {
    return;
  }

  try {
    await setDoc(planRef, {
      ...plan,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const auth = getFirebaseAuth();
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/dailyPlans/${plan.date}`, auth?.currentUser);
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
  const local = loadLocalPlan(uid, date);

  if (!isFirebaseAuthForUid(uid)) {
    return local;
  }

  const db = getFirebaseDb();
  const planRef = uid ? getDailyPlanDocRef(uid, date) : null;

  if (!db || !planRef) {
    return local;
  }

  try {
    const snap = await getDoc(planRef);
    if (!snap.exists()) {
      return local;
    }
    const data = snap.data() as SavedDailyPlan;
    saveLocalPlan(uid, data);
    return data;
  } catch (err) {
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
  const local = loadLocalPlan(uid, date);
  callback(local);

  if (!isFirebaseAuthForUid(uid)) {
    return () => {};
  }

  const db = getFirebaseDb();
  const planRef = uid ? getDailyPlanDocRef(uid, date) : null;

  if (!db || !planRef) {
    return () => {};
  }

  const unsubscribe = onSnapshot(
    planRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const plan = snapshot.data() as SavedDailyPlan;
        saveLocalPlan(uid, plan);
        callback(plan);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.warn("DailyPlan onSnapshot error, falling back to local storage:", error);
      callback(loadLocalPlan(uid, date));
    }
  );

  return unsubscribe;
}

