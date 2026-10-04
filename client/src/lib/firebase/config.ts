import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

/**
 * Vite environment variables for Firebase configuration.
 * All variables use the VITE_ prefix for client-side accessibility.
 */
export interface FirebaseConfigOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
}

const fallbackFirebaseConfig: FirebaseConfigOptions = {
  projectId: "deadlineiq-3a3b5",
  appId: "1:936973779008:web:0eef02029f8ff053c2dfa5",
  apiKey: "AIzaSyAYXdNnnAQVldvH69NX2KUbRCBmYxGYS9Q",
  authDomain: "deadlineiq-3a3b5.firebaseapp.com",
  storageBucket: "deadlineiq-3a3b5.firebasestorage.app",
  messagingSenderId: "936973779008",
};

/**
 * Retrieves Firebase configuration from environment variables with safe fallback.
 */
export function getFirebaseConfig(): FirebaseConfigOptions {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
  };
}

/**
 * Checks whether all required Firebase credentials are provided.
 */
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return Boolean(
    config.apiKey &&
    config.projectId &&
    config.appId &&
    !config.apiKey.includes("YOUR_")
  );
}

let firebaseAppInstance: FirebaseApp | null = null;

/**
 * Centralized Firebase App initialization.
 * Returns null gracefully if environment variables are not yet configured,
 * preventing UI crashes and allowing prototype demo mode to continue smoothly.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (firebaseAppInstance) {
    return firebaseAppInstance;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAppInstance = existingApps[0];
    return firebaseAppInstance;
  }

  const config = getFirebaseConfig();
  if (!isFirebaseConfigured()) {
    return null;
  }

  try {
    firebaseAppInstance = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    return firebaseAppInstance;
  } catch (error) {
    console.warn("Failed to initialize Firebase App with provided credentials:", error);
    return null;
  }
}
