import fs from "node:fs";
import path from "node:path";

let adminApp: any = null;

export async function getAdminApp(): Promise<any> {
  if (adminApp) return adminApp;

  try {
    const { getApps, initializeApp } = await import("firebase-admin/app");
    const existingApps = getApps();
    if (existingApps.length > 0 && existingApps[0]) {
      adminApp = existingApps[0];
      return adminApp;
    }

    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    let projectId =
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      "deadlineiq-3a3b5";
    let storageBucket =
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      "deadlineiq-3a3b5.firebasestorage.app";

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

export async function getAdminAuth(): Promise<any> {
  const app = await getAdminApp();
  if (!app) return null;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    return getAuth(app);
  } catch (err) {
    console.warn("Failed to get Admin Auth:", err);
    return null;
  }
}

export async function getAdminFirestore(): Promise<any> {
  const app = await getAdminApp();
  if (!app) return null;
  try {
    const { getFirestore } = await import("firebase-admin/firestore");
    return getFirestore(app);
  } catch (err) {
    console.warn("Failed to get Admin Firestore:", err);
    return null;
  }
}

export async function getAdminStorage(): Promise<any> {
  const app = await getAdminApp();
  if (!app) return null;
  try {
    const { getStorage } = await import("firebase-admin/storage");
    return getStorage(app);
  } catch (err) {
    console.warn("Failed to get Admin Storage:", err);
    return null;
  }
}
