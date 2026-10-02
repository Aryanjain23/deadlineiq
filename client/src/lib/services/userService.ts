import { getDoc, setDoc } from "firebase/firestore";
import { getUserDocRef, getFirebaseDb, handleFirestoreError, OperationType } from "@/lib/firebase";
import type { UserProfileDocument } from "@/lib/firebase/types";

export async function getUserProfile(uid: string): Promise<UserProfileDocument | null> {
  const db = getFirebaseDb();
  if (!db || !uid) return null;

  const docRef = getUserDocRef(uid);
  if (!docRef) return null;

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as UserProfileDocument;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
}

export async function saveUserProfile(
  uid: string,
  profile: Partial<UserProfileDocument>
): Promise<void> {
  const db = getFirebaseDb();
  if (!db || !uid) return;

  const docRef = getUserDocRef(uid);
  if (!docRef) return;

  try {
    const now = new Date().toISOString();
    await setDoc(
      docRef,
      {
        ...profile,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}
