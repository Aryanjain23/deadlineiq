import {
  getStorage,
  ref,
  type FirebaseStorage,
  type StorageReference,
} from "firebase/storage";
import { getFirebaseApp } from "./config";

let storageInstance: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage | null {
  if (storageInstance) return storageInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    storageInstance = getStorage(app);
    return storageInstance;
  } catch (error) {
    console.warn("Firebase Storage could not be initialized:", error);
    return null;
  }
}

/**
 * Returns canonical storage path for user source artifacts (PDFs, images, notice screenshots).
 * Format: users/{uid}/sources/{sourceId}/{filename}
 */
export function getUserSourceStoragePath(
  uid: string,
  sourceId: string,
  filename: string
): string {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `users/${uid}/sources/${sourceId}/${sanitizedFilename}`;
}

/**
 * Returns StorageReference for an uploaded source notice.
 */
export function getUserSourceStorageRef(
  uid: string,
  sourceId: string,
  filename: string
): StorageReference | null {
  const storage = getFirebaseStorage();
  if (!storage) return null;
  const path = getUserSourceStoragePath(uid, sourceId, filename);
  return ref(storage, path);
}
