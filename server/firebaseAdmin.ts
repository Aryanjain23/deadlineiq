import fs from "node:fs";
import path from "node:path";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

let adminApp: App | null = null;

export function getAdminApp(): App | null {
  if (adminApp) return adminApp;

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    let projectId =
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      "gen-lang-client-0280963417";
    let storageBucket =
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      "gen-lang-client-0280963417.firebasestorage.app";

    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.projectId) projectId = parsed.projectId;
        if (parsed.storageBucket) storageBucket = parsed.storageBucket;
      } catch {}
    }

    adminApp = initializeApp({
      projectId,
      storageBucket,
    });
    return adminApp;
  } catch (err) {
    console.warn("Failed to initialize Firebase Admin SDK:", err);
    return null;
  }
}

export function getAdminAuth(): Auth | null {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getAuth(app);
  } catch {
    return null;
  }
}

export function getAdminFirestore(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getFirestore(app);
  } catch {
    return null;
  }
}

export function getAdminStorage(): Storage | null {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getStorage(app);
  } catch {
    return null;
  }
}
