import {
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getExamsCollectionRef,
  getExamDocRef,
  getFirebaseDb,
  getFirebaseAuth,
} from "@/lib/firebase";
import {
  loadExams,
  saveExams,
  type Exam,
} from "@/lib/exams";

function isFirebaseAuthForUid(uid: string): boolean {
  if (!uid || uid.startsWith("demo-")) return false;
  const auth = getFirebaseAuth();
  return Boolean(auth?.currentUser && auth.currentUser.uid === uid);
}

function normalizeFirestoreExam(data: any): Exam {
  return {
    id: data.id,
    subject: data.subject || "Subject",
    subjectCode: data.subjectCode,
    examDate: data.examDate || "",
    startTime: data.startTime || "",
    endTime: data.endTime,
    examType: data.examType || "Internal",
    room: data.room,
    notes: data.notes,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

/**
 * Loads exams exclusively from the user's Firestore records.
 * Returns an empty array if no exams have been created yet.
 */
export async function getExams(uid: string, fallbackKey = "default"): Promise<Exam[]> {
  const cacheKey = uid || fallbackKey;

  if (!isFirebaseAuthForUid(uid)) {
    return loadExams(cacheKey);
  }

  const db = getFirebaseDb();
  const colRef = uid ? getExamsCollectionRef(uid) : null;

  if (!db || !colRef) {
    return loadExams(cacheKey);
  }

  try {
    const snap = await getDocs(colRef);
    if (snap.empty) {
      saveExams(cacheKey, []);
      return [];
    }

    const items: Exam[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      // Purge any legacy test/demo exams created during development
      if (data.id?.startsWith("exam-demo-") || d.id?.startsWith("exam-demo-") || data.id?.startsWith("demo-") || d.id?.startsWith("demo-")) {
        deleteDoc(d.ref).catch((err) => console.warn("Purged legacy test exam doc:", err));
        continue;
      }
      items.push(normalizeFirestoreExam(data));
    }

    saveExams(cacheKey, items);
    return items;
  } catch (error) {
    console.warn("Firestore getExams failed, falling back to local cache:", error);
    return loadExams(cacheKey);
  }
}

/**
 * Saves or updates an exam entry for the user.
 */
export async function saveExamEntry(
  uid: string,
  exam: Exam,
  fallbackKey = "default"
): Promise<void> {
  const cacheKey = uid || fallbackKey;
  const now = new Date().toISOString();
  const data = {
    ...exam,
    createdAt: exam.createdAt || now,
    updatedAt: now,
  };

  const local = loadExams(cacheKey);
  const updatedLocal = [...local.filter((e) => e.id !== exam.id), exam];
  saveExams(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getExamDocRef(uid, exam.id);
    if (docRef) {
      try {
        await setDoc(docRef, data, { merge: true });
      } catch (err) {
        console.warn("Could not save exam to Firestore:", err);
      }
    }
  }
}

/**
 * Saves/replaces complete list of exams for the user.
 */
export async function saveAllExams(
  uid: string,
  exams: Exam[],
  fallbackKey = "default"
): Promise<void> {
  const cacheKey = uid || fallbackKey;
  const sanitized = exams.filter((e) => e && !e.id?.startsWith("exam-demo-") && !e.id?.startsWith("demo-"));
  saveExams(cacheKey, sanitized);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const colRef = getExamsCollectionRef(uid);
    if (colRef) {
      try {
        const current = await getDocs(colRef);
        const newIds = new Set(sanitized.map((e) => e.id));
        for (const docSnap of current.docs) {
          if (!newIds.has(docSnap.id) || docSnap.id.startsWith("exam-demo-") || docSnap.id.startsWith("demo-")) {
            await deleteDoc(docSnap.ref);
          }
        }
        for (const ex of sanitized) {
          const docRef = getExamDocRef(uid, ex.id);
          if (docRef) {
            await setDoc(
              docRef,
              {
                ...ex,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
        }
      } catch (err) {
        console.warn("Could not sync exams to Firestore:", err);
      }
    }
  }
}

/**
 * Deletes an exam entry for the user.
 */
export async function deleteExamEntry(
  uid: string,
  id: string,
  fallbackKey = "default"
): Promise<void> {
  const cacheKey = uid || fallbackKey;
  const local = loadExams(cacheKey);
  const updatedLocal = local.filter((e) => e.id !== id);
  saveExams(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getExamDocRef(uid, id);
    if (docRef) {
      try {
        await deleteDoc(docRef);
      } catch (err) {
        console.warn("Could not delete exam from Firestore:", err);
      }
    }
  }
}

/**
 * Real-time subscription to exams.
 */
export function subscribeToExams(
  uid: string,
  onUpdate: (exams: Exam[]) => void,
  fallbackKey = "default"
): () => void {
  const cacheKey = uid || fallbackKey;

  if (!isFirebaseAuthForUid(uid)) {
    onUpdate(loadExams(cacheKey));
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getExamsCollectionRef(uid) : null;

  if (!db || !colRef) {
    onUpdate(loadExams(cacheKey));
    return () => {};
  }

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: Exam[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.id?.startsWith("exam-demo-") || d.id?.startsWith("exam-demo-") || data.id?.startsWith("demo-") || d.id?.startsWith("demo-")) {
          deleteDoc(d.ref).catch(() => {});
          continue;
        }
        items.push(normalizeFirestoreExam(data));
      }
      saveExams(cacheKey, items);
      onUpdate(items);
    },
    (error) => {
      console.warn("Exams onSnapshot error, falling back to local cache:", error);
      onUpdate(loadExams(cacheKey));
    }
  );

  return unsubscribe;
}
