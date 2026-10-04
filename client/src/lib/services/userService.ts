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

export async function getUserProfile(uid: string): Promise<UserProfileDocument | null> {
  if (!uid) return null;

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
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as UserProfileDocument;
          try {
            localStorage.setItem(LOCAL_PROFILE_PREFIX + uid, JSON.stringify(data));
          } catch {}
          return data;
        }
      } catch (error) {
        console.warn("Firestore getUserProfile fallback:", error);
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
    await setDoc(docRef, sanitizeForFirestore(merged), { merge: true });
  } catch (error) {
    const auth = getFirebaseAuth();
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`, {
      uid: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
    });
  }
}

export async function deleteUserProfileData(uid: string): Promise<void> {
  if (!uid) return;

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
    await deleteDoc(docRef);
  } catch (error) {
    console.warn("deleteUserProfileData error:", error);
  }
}
