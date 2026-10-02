import {
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getDeadlinesCollectionRef,
  getDeadlineDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import {
  loadDeadlines,
  saveDeadlines,
  type Deadline,
} from "@/lib/deadlines";
import type { FirestoreDeadlineDocument } from "@/lib/firebase/types";

function isFirebaseAuthForUid(uid: string): boolean {
  if (!uid || uid.startsWith("demo-")) return false;
  const auth = getFirebaseAuth();
  return Boolean(auth?.currentUser && auth.currentUser.uid === uid);
}

/**
 * Normalizes Firestore document to application Deadline.
 */
function normalizeFirestoreDeadline(data: FirestoreDeadlineDocument): Deadline {
  return {
    id: data.id,
    taskName: data.taskName,
    subject: data.subject,
    description: data.description || "",
    dueDate: data.dueDate,
    dueTime: data.dueTime || "23:59",
    importance: data.importance,
    completed: Boolean(data.completed),
    createdAt: data.createdAt,
    source: data.source || "manual",
    updatedAt: data.updatedAt,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    dateSource: data.dateSource,
    confidence: data.confidence,
    timetableDerived: data.timetableDerived,
  };
}

/**
 * Fetches all deadlines for a user.
 * Loads exclusively from the authenticated user's Firestore records.
 * Returns an empty array if no records exist (never injects mock/demo data).
 */
export async function getDeadlines(uid: string, usnFallback = "default"): Promise<Deadline[]> {
  const cacheKey = uid || usnFallback;

  if (!isFirebaseAuthForUid(uid)) {
    return loadDeadlines(cacheKey);
  }

  const db = getFirebaseDb();
  const colRef = uid ? getDeadlinesCollectionRef(uid) : null;

  if (!db || !colRef) {
    return loadDeadlines(cacheKey);
  }

  try {
    const snap = await getDocs(colRef);
    if (snap.empty) {
      saveDeadlines(cacheKey, []);
      return [];
    }

    const items: Deadline[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      // If legacy test/demo documents were seeded during previous dev, safely purge them
      if (data.id?.startsWith("demo-") || d.id?.startsWith("demo-")) {
        deleteDoc(d.ref).catch((err) => console.warn("Purged legacy test deadline document:", err));
        continue;
      }
      items.push(normalizeFirestoreDeadline(data));
    }

    // Cache user's real deadlines to localStorage
    saveDeadlines(cacheKey, items);
    return items;
  } catch (error) {
    console.warn("Firestore getDeadlines failed, falling back to local cache:", error);
    return loadDeadlines(cacheKey);
  }
}

/**
 * Creates or overwrites a deadline.
 */
export async function createDeadline(
  uid: string,
  deadline: Deadline,
  usnFallback = "default"
): Promise<Deadline> {
  const userKey = uid || usnFallback;
  const now = new Date().toISOString();
  const normalized: FirestoreDeadlineDocument = {
    id: deadline.id,
    taskName: deadline.taskName,
    subject: deadline.subject,
    description: deadline.description || "",
    dueDate: deadline.dueDate,
    dueTime: deadline.dueTime || "23:59",
    importance: deadline.importance,
    completed: Boolean(deadline.completed),
    createdAt: deadline.createdAt || now,
    updatedAt: now,
    source: deadline.source || "manual",
    sourceType: deadline.sourceType || "manual",
    sourceId: deadline.sourceId,
    dateSource: deadline.dateSource,
    confidence: deadline.confidence,
    timetableDerived: deadline.timetableDerived,
  };

  // Always update local cache immediately for instant UI response
  const local = loadDeadlines(userKey);
  const updatedLocal = [deadline, ...local.filter((d) => d.id !== deadline.id)];
  saveDeadlines(userKey, updatedLocal);

  // If Cloud Firestore is connected, persist to cloud
  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getDeadlineDocRef(uid, deadline.id);
    if (docRef) {
      try {
        await setDoc(docRef, normalized, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}/deadlines/${deadline.id}`, getFirebaseAuth()?.currentUser);
      }
    }
  }

  return deadline;
}

/**
 * Updates an existing deadline.
 */
export async function updateDeadline(
  uid: string,
  id: string,
  updates: Partial<Deadline>,
  usnFallback = "default"
): Promise<void> {
  const userKey = uid || usnFallback;
  const local = loadDeadlines(userKey);
  const updatedLocal = local.map((d) => (d.id === id ? { ...d, ...updates } : d));
  saveDeadlines(userKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getDeadlineDocRef(uid, id);
    if (docRef) {
      try {
        await setDoc(
          docRef,
          {
            ...updates,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/deadlines/${id}`, getFirebaseAuth()?.currentUser);
      }
    }
  }
}

/**
 * Deletes a deadline.
 */
export async function deleteDeadline(
  uid: string,
  id: string,
  usnFallback = "default"
): Promise<void> {
  const userKey = uid || usnFallback;
  const local = loadDeadlines(userKey);
  const updatedLocal = local.filter((d) => d.id !== id);
  saveDeadlines(userKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getDeadlineDocRef(uid, id);
    if (docRef) {
      try {
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}/deadlines/${id}`, getFirebaseAuth()?.currentUser);
      }
    }
  }
}

/**
 * Real-time subscription to deadlines.
 */
export function subscribeToDeadlines(
  uid: string,
  onUpdate: (deadlines: Deadline[]) => void,
  usnFallback = "default"
): () => void {
  const cacheKey = uid || usnFallback;

  if (!isFirebaseAuthForUid(uid)) {
    onUpdate(loadDeadlines(cacheKey));
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getDeadlinesCollectionRef(uid) : null;

  if (!db || !colRef) {
    onUpdate(loadDeadlines(cacheKey));
    return () => {};
  }

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: Deadline[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.id?.startsWith("demo-") || d.id?.startsWith("demo-")) {
          deleteDoc(d.ref).catch(() => {});
          continue;
        }
        items.push(normalizeFirestoreDeadline(data));
      }
      saveDeadlines(cacheKey, items);
      onUpdate(items);
    },
    (error) => {
      console.warn("Deadlines onSnapshot error, falling back to local storage:", error);
      onUpdate(loadDeadlines(cacheKey));
    }
  );

  return unsubscribe;
}
