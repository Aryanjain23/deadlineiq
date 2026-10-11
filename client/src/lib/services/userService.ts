import { getDoc, setDoc, deleteDoc } from "firebase/firestore";
import {
  getUserDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
  sanitizeForFirestore,
} from "@/lib/firebase";
import type { UserProfileDocument } from "@/lib/firebase/types";

const LOCAL_PROFILE_PREFIX = "deadlineiq_profile_";

function isFirebaseAuthForUid(uid: string): boolean {
  if (!uid || uid.startsWith("demo-")) return false;
  const auth = getFirebaseAuth();
  return Boolean(auth?.currentUser && auth.currentUser.uid === uid);
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

export async function getUserProfile(uid: string): Promise<UserProfileDocument | null> {
  if (!uid) return null;
  const path = `users/${uid}`;

  if (!isFirebaseAuthForUid(uid)) {
    try {
      const stored = localStorage.getItem(LOCAL_PROFILE_PREFIX + uid);
      if (stored) {
        return JSON.parse(stored) as UserProfileDocument;
      }
    } catch {}
    return null;
  }

  const db = getFirebaseDb();
  if (db) {
    const docRef = getUserDocRef(uid);
    if (docRef) {
      try {
        const snap = await executeWithAuthRetry(() => getDoc(docRef));
        if (snap.exists()) {
          const data = snap.data() as UserProfileDocument;
          console.log(`[FIRESTORE READ]\nfeature: profile\nuid: ${uid}\npath: ${path}\ndocumentsFound: 1`);
          try {
            localStorage.setItem(LOCAL_PROFILE_PREFIX + uid, JSON.stringify(data));
          } catch {}
          return data;
        } else {
          console.log(`[FIRESTORE READ]\nfeature: profile\nuid: ${uid}\npath: ${path}\ndocumentsFound: 0`);
        }
      } catch (error) {
        console.warn(`[FIRESTORE READ FAILED]\nfeature: profile\nuid: ${uid}\npath: ${path}`, error);
      }
    }
  }

  // Fallback to local storage
  try {
    const stored = localStorage.getItem(LOCAL_PROFILE_PREFIX + uid);
    if (stored) {
      return JSON.parse(stored) as UserProfileDocument;
    }
  } catch {}

  return null;
}

export async function saveUserProfile(
  uid: string,
  profile: Partial<UserProfileDocument>
): Promise<void> {
  if (!uid) return;

  const now = new Date().toISOString();
  const path = `users/${uid}`;
  const merged: Partial<UserProfileDocument> = {
    ...profile,
    uid,
    updatedAt: now,
  };

  // Cache locally
  try {
    const stored = localStorage.getItem(LOCAL_PROFILE_PREFIX + uid);
    const existing = stored ? JSON.parse(stored) : null;
    const full = { ...(existing || {}), ...merged, uid, updatedAt: now };
    localStorage.setItem(LOCAL_PROFILE_PREFIX + uid, JSON.stringify(full));
  } catch {}

  if (!isFirebaseAuthForUid(uid)) {
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;

  const docRef = getUserDocRef(uid);
  if (!docRef) return;

  try {
    await executeWithAuthRetry(() =>
      setDoc(docRef, sanitizeForFirestore(merged), { merge: true })
    );
    console.log(`[FIRESTORE WRITE]\nfeature: profile\nuid: ${uid}\npath: ${path}\ndocumentId: ${uid}\nsuccess: true`);
  } catch (error) {
    console.error(`[FIRESTORE WRITE]\nfeature: profile\nuid: ${uid}\npath: ${path}\ndocumentId: ${uid}\nsuccess: false`, error);
    const auth = getFirebaseAuth();
    handleFirestoreError(error, OperationType.WRITE, path, {
      uid: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
    });
  }
}

export async function deleteUserProfileData(uid: string): Promise<void> {
  if (!uid) return;
  const path = `users/${uid}`;

  try {
    localStorage.removeItem(LOCAL_PROFILE_PREFIX + uid);
  } catch {}

  if (!isFirebaseAuthForUid(uid)) {
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;

  const docRef = getUserDocRef(uid);
  if (!docRef) return;

  try {
    await executeWithAuthRetry(() => deleteDoc(docRef));
    console.log(`[FIRESTORE WRITE]\nfeature: profile\nuid: ${uid}\npath: ${path}\ndocumentId: ${uid}\nsuccess: true (deleted)`);
  } catch (error) {
    console.error(`[FIRESTORE WRITE]\nfeature: profile\nuid: ${uid}\npath: ${path}\ndocumentId: ${uid}\nsuccess: false`, error);
  }
}
