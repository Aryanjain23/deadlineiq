import {
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getTimetableCollectionRef,
  getTimetableDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import {
  loadTimetable,
  saveTimetable,
  type TimetableEntry,
} from "@/lib/timetable";
import type { FirestoreTimetableDocument } from "@/lib/firebase/types";

function isFirebaseAuthForUid(uid: string): boolean {
  if (!uid || uid.startsWith("demo-")) return false;
  const auth = getFirebaseAuth();
  return Boolean(auth?.currentUser && auth.currentUser.uid === uid);
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

  if (!isFirebaseAuthForUid(uid)) {
    return loadTimetable(cacheKey);
  }

  const db = getFirebaseDb();
  const colRef = uid ? getTimetableCollectionRef(uid) : null;

  if (!db || !colRef) {
    return loadTimetable(cacheKey);
  }

  try {
    const snap = await getDocs(colRef);
    if (snap.empty) {
      saveTimetable(cacheKey, []);
      return [];
    }

    const items: TimetableEntry[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      // If legacy test/demo documents were seeded during previous dev, safely purge them
      if (data.id?.startsWith("demo-") || d.id?.startsWith("demo-") || data.id?.startsWith("tt-demo-") || d.id?.startsWith("tt-demo-")) {
        deleteDoc(d.ref).catch((err) => console.warn("Purged legacy test timetable document:", err));
        continue;
      }
      items.push(normalizeFirestoreTimetable(data));
    }

    saveTimetable(cacheKey, items);
    return items;
  } catch (error) {
    console.warn("Firestore getTimetable failed, falling back to local cache:", error);
    return loadTimetable(cacheKey);
  }
}

export async function saveTimetableEntry(
  uid: string,
  entry: TimetableEntry,
  usnFallback = "default"
): Promise<void> {
  const cacheKey = uid || usnFallback;
  const now = new Date().toISOString();
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
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getTimetableDocRef(uid, entry.id);
    if (docRef) {
      try {
        await setDoc(docRef, normalized, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}/timetable/${entry.id}`, getFirebaseAuth()?.currentUser);
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
  if (db && isFirebaseAuthForUid(uid)) {
    const colRef = getTimetableCollectionRef(uid);
    if (colRef) {
      try {
        // Fetch current and sync
        const current = await getDocs(colRef);
        const newIds = new Set(sanitized.map((e) => e.id));
        for (const docSnap of current.docs) {
          if (!newIds.has(docSnap.id) || docSnap.id.startsWith("demo-") || docSnap.id.startsWith("tt-demo-")) {
            await deleteDoc(docSnap.ref);
          }
        }
        for (const e of sanitized) {
          const docRef = getTimetableDocRef(uid, e.id);
          if (docRef) {
            await setDoc(
              docRef,
              {
                id: e.id,
                day: e.day,
                subject: e.subject,
                subjectCode: e.subjectCode || "",
                startTime: e.startTime,
                endTime: e.endTime,
                room: e.room || "",
                instructor: e.instructor || "",
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
        }
      } catch (err) {
        console.warn("Could not sync complete timetable to Firestore:", err);
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
  const local = loadTimetable(cacheKey);
  const updatedLocal = local.filter((t) => t.id !== id);
  saveTimetable(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getTimetableDocRef(uid, id);
    if (docRef) {
      try {
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}/timetable/${id}`, getFirebaseAuth()?.currentUser);
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

  if (!isFirebaseAuthForUid(uid)) {
    onUpdate(loadTimetable(cacheKey));
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getTimetableCollectionRef(uid) : null;

  if (!db || !colRef) {
    onUpdate(loadTimetable(cacheKey));
    return () => {};
  }

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: TimetableEntry[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.id?.startsWith("demo-") || d.id?.startsWith("demo-") || data.id?.startsWith("tt-demo-") || d.id?.startsWith("tt-demo-")) {
          deleteDoc(d.ref).catch(() => {});
          continue;
        }
        items.push(normalizeFirestoreTimetable(data));
      }
      saveTimetable(cacheKey, items);
      onUpdate(items);
    },
    (error) => {
      console.warn("Timetable onSnapshot error, falling back to local storage:", error);
      onUpdate(loadTimetable(cacheKey));
    }
  );

  return unsubscribe;
}
