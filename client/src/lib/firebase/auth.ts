import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  deleteUser,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type Auth,
  type User,
} from "firebase/auth";
import { getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { getFirebaseApp, isFirebaseConfigured } from "./config";
import { getUserDocRef, getFirebaseDb } from "./firestore";
import type { UserProfileDocument } from "./types";
import {
  checkEmailRegistered,
  recordAccountRegistration,
  recordAccountUnregistration,
} from "./registry";

let authInstance: Auth | null = null;
let persistenceSet = false;

/**
 * Initializes or returns the cached Firebase Auth instance.
 * Automatically enables browser local persistence across sessions.
 */
export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    authInstance = getAuth(app);
    if (!persistenceSet) {
      setPersistence(authInstance, browserLocalPersistence).catch((err) => {
        console.warn("Failed to set Firebase Auth persistence:", err);
      });
      persistenceSet = true;
    }
    return authInstance;
  } catch (error) {
    console.warn("Firebase Auth could not be initialized:", error);
    return null;
  }
}

/**
 * Normalizes phone numbers to standard E.164 format.
 * Defaults to India (+91) if a 10-digit number is provided.
 */
export function formatPhoneNumber(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";

  // If already prefixed with +, remove whitespace and special characters
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/[^0-9]/g, "");
  }

  // Strip all non-digits
  const digits = trimmed.replace(/[^0-9]/g, "");

  // If 10 digits (Standard Indian Mobile Number)
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // If 11 digits starting with 0
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  // If 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

/**
 * Creates or synchronizes the user profile document at users/{uid} in Firestore.
 * Does NOT store passwords in Firestore.
 */
export async function syncUserProfileDocument(
  user: User,
  additionalData?: { displayName?: string; usn?: string }
): Promise<void> {
  const db = getFirebaseDb();
  if (!db || !user?.uid) return;

  const docRef = getUserDocRef(user.uid);
  if (!docRef) return;

  try {
    const snap = await getDoc(docRef);
    const now = new Date().toISOString();

    if (snap.exists()) {
      const existing = snap.data() as UserProfileDocument;
      await setDoc(
        docRef,
        {
          uid: user.uid,
          displayName: user.displayName || additionalData?.displayName || existing.displayName || "Student",
          email: user.email ?? existing.email ?? null,
          phoneNumber: user.phoneNumber ?? existing.phoneNumber ?? null,
          photoURL: user.photoURL ?? existing.photoURL ?? null,
          usn: additionalData?.usn || existing.usn || "",
          lastLoginAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      const newProfile: UserProfileDocument = {
        uid: user.uid,
        displayName: user.displayName || additionalData?.displayName || "Student",
        email: user.email || null,
        phoneNumber: user.phoneNumber || null,
        photoURL: user.photoURL || null,
        usn: additionalData?.usn || "",
        semester: "",
        branch: "",
        college: "",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      await setDoc(docRef, newProfile);
    }
  } catch (err) {
    console.warn("Unable to sync user document to Firestore:", err);
  }
}

/**
 * Verifies whether a given user possesses an existing DeadlineIQ account
 * by inspecting the Firestore users/{uid} document and the verified account directory.
 */
export async function checkUserHasDeadlineIQAccount(user: User): Promise<boolean> {
  if (!user?.uid) return false;

  // 1. Check Firestore document at users/{uid}
  const docRef = getUserDocRef(user.uid);
  if (docRef) {
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) return true;
    } catch (e) {
      console.warn("Could not check Firestore user doc:", e);
    }
  }

  // 2. Check server directory for registered email
  if (user.email) {
    try {
      const exists = await checkEmailRegistered(user.email);
      if (exists) return true;
    } catch (e) {
      console.warn("Could not check email directory:", e);
    }
  }

  return false;
}

/**
 * Google Sign-In using Firebase GoogleAuthProvider with mode awareness.
 * - In "signin" mode: ONLY allows existing DeadlineIQ accounts.
 *   If no account exists, rejects access, cleans up temporary Auth user, and throws.
 * - In "signup" mode: ONLY registers new accounts.
 *   If account already exists, rejects access and prompts to sign in.
 */
export async function signInWithGoogle(
  mode: "signin" | "signup" = "signin",
  fallbackToRedirect = true
): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth is not configured. Provide Firebase environment variables.");
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (!user) return null;

    const hasAccount = await checkUserHasDeadlineIQAccount(user);

    if (mode === "signin") {
      if (!hasAccount) {
        // Unregistered Google user attempting Sign In:
        // Immediately delete temporary auth user and sign out
        try {
          await user.delete();
        } catch (delErr) {
          console.warn("Could not delete temporary OAuth user:", delErr);
        }
        await signOut(auth);
        const err: any = new Error("No DeadlineIQ account found for this Google account. Please use Create Account first.");
        err.code = "deadlineiq/no-google-account";
        throw err;
      }

      // Legitimate existing user: sync profile timestamp and registry
      await syncUserProfileDocument(user);
      if (user.email) {
        await recordAccountRegistration(user.email, user.uid, user.displayName || undefined);
      }
      return user;
    } else {
      // mode === "signup"
      if (hasAccount) {
        // Already registered user attempting to re-register
        await signOut(auth);
        const err: any = new Error("An account with this email already exists. Please sign in instead.");
        err.code = "deadlineiq/account-already-exists";
        throw err;
      }

      // New user creating account with Google: create profile document and directory entry
      await syncUserProfileDocument(user);
      if (user.email) {
        await recordAccountRegistration(user.email, user.uid, user.displayName || undefined);
      }
      return user;
    }
  } catch (error: any) {
    // If popup was blocked or cancelled, fall back to redirect if top frame
    const canRedirect = typeof window !== "undefined" && window.top === window.self;
    if (
      fallbackToRedirect &&
      canRedirect &&
      (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request")
    ) {
      try {
        sessionStorage.setItem("deadlineiq_pending_auth_mode", mode);
        await signInWithRedirect(auth, provider);
        return null;
      } catch (redirectErr) {
        console.warn("Redirect fallback prevented:", redirectErr);
      }
    }
    throw error;
  }
}

/**
 * Checks for a pending redirect result upon app initialization.
 */
export async function checkRedirectResult(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;

  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      const mode =
        (typeof window !== "undefined" &&
          sessionStorage.getItem("deadlineiq_pending_auth_mode")) ||
        "signin";
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("deadlineiq_pending_auth_mode");
      }

      const hasAccount = await checkUserHasDeadlineIQAccount(result.user);

      if (mode === "signin") {
        if (!hasAccount) {
          try {
            await result.user.delete();
          } catch (e) {}
          await signOut(auth);
          return null;
        }
        await syncUserProfileDocument(result.user);
        return result.user;
      } else {
        if (hasAccount) {
          await signOut(auth);
          return null;
        }
        await syncUserProfileDocument(result.user);
        if (result.user.email) {
          await recordAccountRegistration(result.user.email, result.user.uid, result.user.displayName || undefined);
        }
        return result.user;
      }
    }
    return null;
  } catch (error) {
    console.warn("Error processing redirect result:", error);
    return null;
  }
}

/**
 * Email & Password account sign-up.
 * Rejects if the email already belongs to an existing DeadlineIQ user.
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName: string,
  usn?: string
): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth is not configured. Provide Firebase environment variables.");
  }

  const cleanEmail = email.trim().toLowerCase();

  // Check directory first for duplicate email
  const alreadyRegistered = await checkEmailRegistered(cleanEmail);
  if (alreadyRegistered) {
    const err: any = new Error("An account with this email already exists. Please sign in instead.");
    err.code = "auth/email-already-in-use";
    throw err;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
    const user = userCredential.user;

    if (displayName) {
      try {
        await updateProfile(user, { displayName: displayName.trim() });
      } catch (err) {
        console.warn("Could not set displayName on Firebase user:", err);
      }
    }

    await syncUserProfileDocument(user, { displayName, usn });
    await recordAccountRegistration(cleanEmail, user.uid, displayName, usn);
    return user;
  } catch (error: any) {
    if (
      error?.code === "auth/email-already-in-use" ||
      error?.message?.includes("email-already-in-use")
    ) {
      const err: any = new Error("An account with this email already exists. Please sign in instead.");
      err.code = "auth/email-already-in-use";
      throw err;
    }
    throw error;
  }
}

/**
 * Email & Password login.
 * Rejects if the email does not belong to an existing DeadlineIQ user.
 */
export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth is not configured. Provide Firebase environment variables.");
  }

  const cleanEmail = email.trim().toLowerCase();

  // Check if account is known in directory
  const existsInRegistry = await checkEmailRegistered(cleanEmail);

  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    const user = userCredential.user;

    // Verify Firestore account profile
    const hasAccount = await checkUserHasDeadlineIQAccount(user);
    if (!hasAccount && !existsInRegistry) {
      await signOut(auth);
      const err: any = new Error("No DeadlineIQ account exists with this email. Please create an account first.");
      err.code = "deadlineiq/no-email-account";
      throw err;
    }

    await syncUserProfileDocument(user);
    await recordAccountRegistration(cleanEmail, user.uid);
    return user;
  } catch (error: any) {
    const code = error?.code || "";
    const msg = error?.message || "";

    if (code === "auth/user-not-found" || msg.includes("user-not-found")) {
      const err: any = new Error("No DeadlineIQ account exists with this email. Please create an account first.");
      err.code = "deadlineiq/no-email-account";
      throw err;
    }

    if (code === "auth/wrong-password" || msg.includes("wrong-password")) {
      const err: any = new Error("Incorrect password. Please try again.");
      err.code = "auth/wrong-password";
      throw err;
    }

    if (
      code === "auth/invalid-credential" ||
      code === "auth/invalid-login-credentials" ||
      msg.includes("INVALID_LOGIN_CREDENTIALS")
    ) {
      if (existsInRegistry) {
        const err: any = new Error("Incorrect password. Please try again.");
        err.code = "auth/wrong-password";
        throw err;
      } else {
        const err: any = new Error("No DeadlineIQ account exists with this email. Please create an account first.");
        err.code = "deadlineiq/no-email-account";
        throw err;
      }
    }

    throw error;
  }
}

/**
 * Sends a password reset email via Firebase.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth is not configured. Provide Firebase environment variables.");
  }

  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Signs out from Firebase Authentication.
 */
export async function logOutFromFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) {
    await signOut(auth);
  }
}

/**
 * Updates display name and photoURL in Firebase Auth user record.
 */
export async function updateFirebaseUserProfile(updates: {
  displayName?: string;
  photoURL?: string;
}): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth?.currentUser) {
    await updateProfile(auth.currentUser, updates);
  }
}

/**
 * Deletes user account from Firebase Auth, Firestore profile document, and server registry.
 */
export async function deleteUserAccount(
  uid: string,
  email?: string | null
): Promise<void> {
  const db = getFirebaseDb();
  if (db && uid) {
    try {
      const docRef = getUserDocRef(uid);
      if (docRef) {
        await deleteDoc(docRef);
      }
    } catch (e) {
      console.warn("Could not delete firestore user document:", e);
    }
  }

  if (email) {
    await recordAccountUnregistration(email);
  }

  const auth = getFirebaseAuth();
  if (auth?.currentUser) {
    try {
      await deleteUser(auth.currentUser);
    } catch (e) {
      console.warn("Firebase deleteUser:", e);
    }
    await signOut(auth);
  }
}

/**
 * Observes Firebase Auth state changes.
 */
export function onFirebaseAuthStateChanged(
  callback: (user: User | null) => void
): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// Backward compatibility alias
export const signInWithGooglePopup = signInWithGoogle;

export { isFirebaseConfigured };
