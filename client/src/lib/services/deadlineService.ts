import {
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getDeadlinesCollectionRef,
  getDeadlineDocRef,
  getUserDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
  sanitizeForFirestore,
} from "@/lib/firebase";
import {
  loadDeadlines,
  saveDeadlines,
  type Deadline,
} from "@/lib/deadlines";
import type { FirestoreDeadlineDocument } from "@/lib/firebase/types";

function isRealUserUid(uid?: string | null): boolean {
  if (!uid || typeof uid !== "string") return false;
  if (uid === "guest" || uid === "default" || uid.startsWith("demo-")) return false;
  return true;
}

async function executeWithAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isPermission =
      err?.code === "permission-denied" ||
      String(err?.message || "").includes("Missing or insufficient permissions") ||
      String(err?.message || "").includes("permission-denied");
    if (isPermission) {
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
          return await fn();
        } catch {}
      }
    }
    throw err;
  }
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
  const path = `users/${uid}/deadlines`;

  if (!isRealUserUid(uid)) {
    return loadDeadlines(cacheKey);
  }

  const db = getFirebaseDb();
  if (!db) {
    return loadDeadlines(cacheKey);
  }

  // 1. Check subcollection first
  const colRef = uid ? getDeadlinesCollectionRef(uid) : null;
  if (colRef) {
    try {
      const snap = await executeWithAuthRetry(() => getDocs(colRef));
      if (!snap.empty) {
        const items: Deadline[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.id?.startsWith("demo-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreDeadline(data));
        }
        console.log(`[FIRESTORE READ]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${items.length}`);
        saveDeadlines(cacheKey, items);
        return items;
      }
    } catch (error) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: deadlines subcollection:`, error);
    }
  }

  // 2. Fall back to user document root
  const userDocRef = getUserDocRef(uid);
  if (userDocRef) {
    try {
      const uSnap = await executeWithAuthRetry(() => getDoc(userDocRef));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (Array.isArray(uData?.deadlines) && uData.deadlines.length > 0) {
          const items: Deadline[] = uData.deadlines
            .filter((d: any) => d && !d.id?.startsWith("demo-"))
            .map((d: any) => normalizeFirestoreDeadline(d));
          console.log(`[FIRESTORE READ]\nfeature: deadlines\nuid: ${uid}\npath: users/${uid}\ndocumentsFound: ${items.length}`);
          saveDeadlines(cacheKey, items);
          return items;
        }
      }
    } catch (uErr) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: deadlines user document:`, uErr);
    }
  }

  return loadDeadlines(cacheKey);
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
  const path = `users/${uid}/deadlines/${deadline.id}`;
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

  const local = loadDeadlines(userKey);
  const updatedLocal = [deadline, ...local.filter((d) => d.id !== deadline.id)];
  saveDeadlines(userKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    let userDocSaved = false;
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              deadlines: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
        console.log(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: users/${uid}\ndocumentId: ${deadline.id}\nsuccess: true`);
      } catch (uErr) {
        console.warn(`[FIRESTORE WRITE]\nfeature: deadlines user doc warning:`, uErr);
      }
    }

    const docRef = getDeadlineDocRef(uid, deadline.id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(docRef, sanitizeForFirestore(normalized), { merge: true })
        );
        console.log(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${deadline.id}\nsuccess: true`);
      } catch (error) {
        if (userDocSaved) {
          console.log(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${deadline.id}\nsuccess: true (persisted to user document)`);
        } else {
          console.error(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${deadline.id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.WRITE, path, getFirebaseAuth()?.currentUser);
        }
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
  const path = `users/${uid}/deadlines/${id}`;
  const now = new Date().toISOString();

  const local = loadDeadlines(userKey);
  const updatedLocal = local.map((d) => (d.id === id ? { ...d, ...updates } : d));
  saveDeadlines(userKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    let userDocSaved = false;
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              deadlines: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
      } catch {}
    }

    const docRef = getDeadlineDocRef(uid, id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            docRef,
            sanitizeForFirestore({
              ...updates,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        console.log(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: true`);
      } catch (error) {
        if (!userDocSaved) {
          console.error(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.UPDATE, path, getFirebaseAuth()?.currentUser);
        }
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
  const path = `users/${uid}/deadlines/${id}`;
  const now = new Date().toISOString();

  const local = loadDeadlines(userKey);
  const updatedLocal = local.filter((d) => d.id !== id);
  saveDeadlines(userKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    let userDocSaved = false;
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              deadlines: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
      } catch {}
    }

    const docRef = getDeadlineDocRef(uid, id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() => deleteDoc(docRef));
        console.log(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: true (deleted)`);
      } catch (error) {
        if (!userDocSaved) {
          console.error(`[FIRESTORE WRITE]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.DELETE, path, getFirebaseAuth()?.currentUser);
        }
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
  const path = `users/${uid}/deadlines`;

  onUpdate(loadDeadlines(cacheKey));

  if (!isRealUserUid(uid)) {
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getDeadlinesCollectionRef(uid) : null;
  const userDocRef = uid ? getUserDocRef(uid) : null;

  if (!db || !colRef) {
    return () => {};
  }

  let userDocUnsub: (() => void) | null = null;

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const count = snapshot.empty ? 0 : snapshot.docs.length;
      console.log(`[FIRESTORE READ]\nfeature: deadlines\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${count}`);
      if (!snapshot.empty) {
        const items: Deadline[] = [];
        for (const d of snapshot.docs) {
          const data = d.data();
          if (data.id?.startsWith("demo-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreDeadline(data));
        }
        saveDeadlines(cacheKey, items);
        onUpdate(items);
      }
    },
    (error) => {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: deadlines subcollection, switching to user doc listener:`, error);
      if (userDocRef && !userDocUnsub) {
        userDocUnsub = onSnapshot(
          userDocRef,
          (uSnap) => {
            if (uSnap.exists()) {
              const uData = uSnap.data();
              if (Array.isArray(uData?.deadlines)) {
                const items = uData.deadlines
                  .filter((d: any) => d && !d.id?.startsWith("demo-"))
                  .map((d: any) => normalizeFirestoreDeadline(d));
                saveDeadlines(cacheKey, items);
                onUpdate(items);
              }
            }
          },
          () => {
            onUpdate(loadDeadlines(cacheKey));
          }
        );
      } else {
        onUpdate(loadDeadlines(cacheKey));
      }
    }
  );

  return () => {
    unsubscribe();
    if (userDocUnsub) userDocUnsub();
  };
}
