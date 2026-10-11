import {
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getExamsCollectionRef,
  getExamDocRef,
  getUserDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  sanitizeForFirestore,
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import {
  loadExams,
  saveExams,
  type Exam,
} from "@/lib/exams";

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
  const path = `users/${uid}/exams`;

  if (!isRealUserUid(uid)) {
    return loadExams(cacheKey);
  }

  const db = getFirebaseDb();
  if (!db) {
    return loadExams(cacheKey);
  }

  // 1. Check subcollection first
  const colRef = getExamsCollectionRef(uid);
  if (colRef) {
    try {
      const snap = await executeWithAuthRetry(() => getDocs(colRef));
      if (!snap.empty) {
        const items: Exam[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.id?.startsWith("exam-demo-") || data.id?.startsWith("demo-") || data.id?.startsWith("sample-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreExam(data));
        }
        console.log(`[FIRESTORE READ]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${items.length}`);
        saveExams(cacheKey, items);
        return items;
      }
    } catch (error) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: exams subcollection:`, error);
    }
  }

  // 2. Fall back to user document root
  const userDocRef = getUserDocRef(uid);
  if (userDocRef) {
    try {
      const uSnap = await executeWithAuthRetry(() => getDoc(userDocRef));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (Array.isArray(uData?.exams) && uData.exams.length > 0) {
          const items: Exam[] = uData.exams
            .filter((e: any) => e && !e.id?.startsWith("exam-demo-") && !e.id?.startsWith("demo-") && !e.id?.startsWith("sample-"))
            .map((e: any) => normalizeFirestoreExam(e));
          console.log(`[FIRESTORE READ]\nfeature: exams\nuid: ${uid}\npath: users/${uid}\ndocumentsFound: ${items.length}`);
          saveExams(cacheKey, items);
          return items;
        }
      }
    } catch (uErr) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: exams user document:`, uErr);
    }
  }

  return loadExams(cacheKey);
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
  const path = `users/${uid}/exams/${exam.id}`;
  const data = {
    ...exam,
    createdAt: exam.createdAt || now,
    updatedAt: now,
  };

  const local = loadExams(cacheKey);
  const updatedLocal = [...local.filter((e) => e.id !== exam.id), exam];
  saveExams(cacheKey, updatedLocal);

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
              exams: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
        console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: users/${uid}\ndocumentId: ${exam.id}\nsuccess: true`);
      } catch (uErr) {
        console.warn(`[FIRESTORE WRITE]\nfeature: exams user doc save warning:`, uErr);
      }
    }

    const docRef = getExamDocRef(uid, exam.id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(docRef, sanitizeForFirestore(data), { merge: true })
        );
        console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentId: ${exam.id}\nsuccess: true`);
      } catch (err) {
        if (userDocSaved) {
          console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentId: ${exam.id}\nsuccess: true (persisted to user document)`);
        } else {
          console.error(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentId: ${exam.id}\nsuccess: false`, err);
          handleFirestoreError(err, OperationType.WRITE, path, getFirebaseAuth()?.currentUser);
        }
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
              exams: sanitized,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
        console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: users/${uid}\nsuccess: true`);
      } catch (uErr) {
        console.warn(`[FIRESTORE WRITE]\nfeature: exams user doc warning:`, uErr);
      }
    }

    // 2. Also sync individual documents to subcollection users/{uid}/exams
    const colRef = getExamsCollectionRef(uid);
    if (colRef) {
      try {
        const current = await executeWithAuthRetry(() => getDocs(colRef));
        const newIds = new Set(sanitized.map((e) => e.id));
        for (const docSnap of current.docs) {
          if (!newIds.has(docSnap.id) || docSnap.id.startsWith("exam-demo-") || docSnap.id.startsWith("demo-")) {
            await executeWithAuthRetry(() => deleteDoc(docSnap.ref));
            console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: users/${uid}/exams/${docSnap.id}\ndocumentId: ${docSnap.id}\nsuccess: true (deleted)`);
          }
        }
        for (const ex of sanitized) {
          const docRef = getExamDocRef(uid, ex.id);
          const path = `users/${uid}/exams/${ex.id}`;
          if (docRef) {
            await executeWithAuthRetry(() =>
              setDoc(
                docRef,
                sanitizeForFirestore({
                  ...ex,
                  updatedAt: now,
                }),
                { merge: true }
              )
            );
            console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentId: ${ex.id}\nsuccess: true`);
          }
        }
      } catch (err) {
        if (userDocSaved) {
          console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: users/${uid}/exams\nsynced via user document fallback`);
        } else {
          console.error(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: users/${uid}/exams\nsuccess: false`, err);
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}/exams`, getFirebaseAuth()?.currentUser);
        }
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
  const path = `users/${uid}/exams/${id}`;
  const local = loadExams(cacheKey);
  const updatedLocal = local.filter((e) => e.id !== id);
  saveExams(cacheKey, updatedLocal);

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
              exams: updatedLocal,
              updatedAt: new Date().toISOString(),
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
      } catch {}
    }

    const docRef = getExamDocRef(uid, id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() => deleteDoc(docRef));
        console.log(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: true (deleted)`);
      } catch (err) {
        if (!userDocSaved) {
          console.error(`[FIRESTORE WRITE]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: false`, err);
          handleFirestoreError(err, OperationType.DELETE, path, getFirebaseAuth()?.currentUser);
        }
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
  const path = `users/${uid}/exams`;

  onUpdate(loadExams(cacheKey));

  if (!isRealUserUid(uid)) {
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getExamsCollectionRef(uid) : null;
  const userDocRef = uid ? getUserDocRef(uid) : null;

  if (!db || !colRef) {
    return () => {};
  }

  let userDocUnsub: (() => void) | null = null;

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const count = snapshot.empty ? 0 : snapshot.docs.length;
      console.log(`[FIRESTORE READ]\nfeature: exams\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${count}`);
      if (!snapshot.empty) {
        const items: Exam[] = [];
        for (const d of snapshot.docs) {
          const data = d.data();
          if (data.id?.startsWith("exam-demo-") || data.id?.startsWith("demo-") || data.id?.startsWith("sample-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreExam(data));
        }
        saveExams(cacheKey, items);
        onUpdate(items);
      }
    },
    (error) => {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: exams subcollection, switching to user doc listener:`, error);
      if (userDocRef && !userDocUnsub) {
        userDocUnsub = onSnapshot(
          userDocRef,
          (uSnap) => {
            if (uSnap.exists()) {
              const uData = uSnap.data();
              if (Array.isArray(uData?.exams)) {
                const items = uData.exams
                  .filter((e: any) => e && !e.id?.startsWith("exam-demo-") && !e.id?.startsWith("demo-"))
                  .map((e: any) => normalizeFirestoreExam(e));
                saveExams(cacheKey, items);
                onUpdate(items);
              }
            }
          },
          () => {
            onUpdate(loadExams(cacheKey));
          }
        );
      } else {
        onUpdate(loadExams(cacheKey));
      }
    }
  );

  return () => {
    unsubscribe();
    if (userDocUnsub) userDocUnsub();
  };
}

