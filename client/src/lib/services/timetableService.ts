import {
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getTimetableCollectionRef,
  getTimetableDocRef,
  getUserDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
  sanitizeForFirestore,
} from "@/lib/firebase";
import {
  loadTimetable,
  saveTimetable,
  type TimetableEntry,
} from "@/lib/timetable";
import type { FirestoreTimetableDocument } from "@/lib/firebase/types";

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

function normalizeFirestoreTimetable(data: FirestoreTimetableDocument): TimetableEntry {
  return {
    id: data.id,
    day: data.day,
    subject: data.subject,
    subjectCode: data.subjectCode,
    startTime: data.startTime,
    endTime: data.endTime,
    room: data.room,
    instructor: data.instructor,
  };
}

export async function getTimetable(uid: string, usnFallback = "default"): Promise<TimetableEntry[]> {
  const cacheKey = uid || usnFallback;
  const path = `users/${uid}/timetable`;

  if (!isRealUserUid(uid)) {
    return loadTimetable(cacheKey);
  }

  const db = getFirebaseDb();
  if (!db) {
    return loadTimetable(cacheKey);
  }

  // 1. Check subcollection first
  const colRef = uid ? getTimetableCollectionRef(uid) : null;
  if (colRef) {
    try {
      const snap = await executeWithAuthRetry(() => getDocs(colRef));
      if (!snap.empty) {
        const items: TimetableEntry[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.id?.startsWith("demo-") || data.id?.startsWith("tt-demo-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreTimetable(data));
        }
        console.log(`[FIRESTORE READ]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${items.length}`);
        saveTimetable(cacheKey, items);
        return items;
      }
    } catch (error) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: timetable subcollection:`, error);
    }
  }

  // 2. Fall back to user document root
  const userDocRef = getUserDocRef(uid);
  if (userDocRef) {
    try {
      const uSnap = await executeWithAuthRetry(() => getDoc(userDocRef));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (Array.isArray(uData?.timetable) && uData.timetable.length > 0) {
          const items: TimetableEntry[] = uData.timetable
            .filter((t: any) => t && !t.id?.startsWith("demo-") && !t.id?.startsWith("tt-demo-"))
            .map((t: any) => normalizeFirestoreTimetable(t));
          console.log(`[FIRESTORE READ]\nfeature: timetable\nuid: ${uid}\npath: users/${uid}\ndocumentsFound: ${items.length}`);
          saveTimetable(cacheKey, items);
          return items;
        }
      }
    } catch (uErr) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: timetable user document:`, uErr);
    }
  }

  return loadTimetable(cacheKey);
}

export async function saveTimetableEntry(
  uid: string,
  entry: TimetableEntry,
  usnFallback = "default"
): Promise<void> {
  const cacheKey = uid || usnFallback;
  const now = new Date().toISOString();
  const path = `users/${uid}/timetable/${entry.id}`;
  const normalized: FirestoreTimetableDocument = {
    id: entry.id,
    day: entry.day,
    subject: entry.subject,
    subjectCode: entry.subjectCode || "",
    startTime: entry.startTime,
    endTime: entry.endTime,
    room: entry.room || "",
    instructor: entry.instructor || "",
    createdAt: now,
    updatedAt: now,
  };

  const local = loadTimetable(cacheKey);
  const updatedLocal = [...local.filter((t) => t.id !== entry.id), entry];
  saveTimetable(cacheKey, updatedLocal);

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
              timetable: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
        console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: users/${uid}\ndocumentId: ${entry.id}\nsuccess: true`);
      } catch (uErr) {
        console.warn(`[FIRESTORE WRITE]\nfeature: timetable user doc warning:`, uErr);
      }
    }

    const docRef = getTimetableDocRef(uid, entry.id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(docRef, sanitizeForFirestore(normalized), { merge: true })
        );
        console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentId: ${entry.id}\nsuccess: true`);
      } catch (error) {
        if (userDocSaved) {
          console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentId: ${entry.id}\nsuccess: true (persisted to user document)`);
        } else {
          console.error(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentId: ${entry.id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.WRITE, path, getFirebaseAuth()?.currentUser);
        }
      }
    }
  }
}

/**
 * Saves or replaces the complete set of timetable entries for a student.
 */
export async function saveAllTimetableEntries(
  uid: string,
  entries: TimetableEntry[],
  usnFallback = "default"
): Promise<void> {
  const cacheKey = uid || usnFallback;
  const sanitized = entries.filter((t) => t && !t.id?.startsWith("demo-") && !t.id?.startsWith("tt-demo-"));
  saveTimetable(cacheKey, sanitized);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    const now = new Date().toISOString();
    let userDocSaved = false;

    // 1. Persist to users/{uid} root document
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              timetable: sanitized,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
        console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: users/${uid}\nsuccess: true`);
      } catch (uErr) {
        console.warn(`[FIRESTORE WRITE]\nfeature: timetable user doc warning:`, uErr);
      }
    }

    // 2. Also sync individual documents to subcollection users/{uid}/timetable
    const colRef = getTimetableCollectionRef(uid);
    if (colRef) {
      try {
        const current = await executeWithAuthRetry(() => getDocs(colRef));
        const newIds = new Set(sanitized.map((e) => e.id));
        for (const docSnap of current.docs) {
          if (!newIds.has(docSnap.id) || docSnap.id.startsWith("demo-") || docSnap.id.startsWith("tt-demo-")) {
            await executeWithAuthRetry(() => deleteDoc(docSnap.ref));
            console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: users/${uid}/timetable/${docSnap.id}\ndocumentId: ${docSnap.id}\nsuccess: true (deleted)`);
          }
        }
        for (const e of sanitized) {
          const docRef = getTimetableDocRef(uid, e.id);
          const path = `users/${uid}/timetable/${e.id}`;
          if (docRef) {
            await executeWithAuthRetry(() =>
              setDoc(
                docRef,
                sanitizeForFirestore({
                  id: e.id,
                  day: e.day,
                  subject: e.subject,
                  subjectCode: e.subjectCode || "",
                  startTime: e.startTime,
                  endTime: e.endTime,
                  room: e.room || "",
                  instructor: e.instructor || "",
                  updatedAt: now,
                }),
                { merge: true }
              )
            );
            console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentId: ${e.id}\nsuccess: true`);
          }
        }
      } catch (err) {
        if (userDocSaved) {
          console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: users/${uid}/timetable\nsynced via user document fallback`);
        } else {
          console.error(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: users/${uid}/timetable\nsuccess: false`, err);
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}/timetable`, getFirebaseAuth()?.currentUser);
        }
      }
    }
  }
}

export async function deleteTimetableEntry(
  uid: string,
  id: string,
  usnFallback = "default"
): Promise<void> {
  const cacheKey = uid || usnFallback;
  const path = `users/${uid}/timetable/${id}`;
  const local = loadTimetable(cacheKey);
  const updatedLocal = local.filter((t) => t.id !== id);
  saveTimetable(cacheKey, updatedLocal);

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
              timetable: updatedLocal,
              updatedAt: new Date().toISOString(),
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
      } catch {}
    }

    const docRef = getTimetableDocRef(uid, id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() => deleteDoc(docRef));
        console.log(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: true (deleted)`);
      } catch (error) {
        if (!userDocSaved) {
          console.error(`[FIRESTORE WRITE]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.DELETE, path, getFirebaseAuth()?.currentUser);
        }
      }
    }
  }
}

export function subscribeToTimetable(
  uid: string,
  onUpdate: (entries: TimetableEntry[]) => void,
  usnFallback = "default"
): () => void {
  const cacheKey = uid || usnFallback;
  const path = `users/${uid}/timetable`;

  onUpdate(loadTimetable(cacheKey));

  if (!isRealUserUid(uid)) {
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getTimetableCollectionRef(uid) : null;
  const userDocRef = uid ? getUserDocRef(uid) : null;

  if (!db || !colRef) {
    return () => {};
  }

  let userDocUnsub: (() => void) | null = null;

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const count = snapshot.empty ? 0 : snapshot.docs.length;
      console.log(`[FIRESTORE READ]\nfeature: timetable\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${count}`);
      if (!snapshot.empty) {
        const items: TimetableEntry[] = [];
        for (const d of snapshot.docs) {
          const data = d.data();
          if (data.id?.startsWith("demo-") || data.id?.startsWith("tt-demo-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreTimetable(data));
        }
        saveTimetable(cacheKey, items);
        onUpdate(items);
      }
    },
    (error) => {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: timetable subcollection, switching to user doc listener:`, error);
      if (userDocRef && !userDocUnsub) {
        userDocUnsub = onSnapshot(
          userDocRef,
          (uSnap) => {
            if (uSnap.exists()) {
              const uData = uSnap.data();
              if (Array.isArray(uData?.timetable)) {
                const items = uData.timetable
                  .filter((t: any) => t && !t.id?.startsWith("demo-") && !t.id?.startsWith("tt-demo-"))
                  .map((t: any) => normalizeFirestoreTimetable(t));
                saveTimetable(cacheKey, items);
                onUpdate(items);
              }
            }
          },
          () => {
            onUpdate(loadTimetable(cacheKey));
          }
        );
      } else {
        onUpdate(loadTimetable(cacheKey));
      }
    }
  );

  return () => {
    unsubscribe();
    if (userDocUnsub) userDocUnsub();
  };
}
