/**
 * Firebase error mapping and diagnostic error handler.
 */

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

/**
 * Standard diagnostic handler per Firebase integration guidelines.
 * Throws a JSON stringified FirestoreErrorInfo for traceability.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  currentUser?: { uid?: string; email?: string | null } | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Translates low-level Firebase and network codes into clear, user-friendly messages.
 * Does not expose raw technical stack traces to students.
 */
export function isUnauthorizedDomainError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || "";
  return (
    code === "auth/unauthorized-domain" ||
    message.includes("auth/unauthorized-domain") ||
    message.includes("unauthorized-domain")
  );
}

export function isAuthCancelledError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || "";
  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    message.includes("auth/popup-closed-by-user") ||
    message.includes("cancelled-popup-request") ||
    message.includes("popup closed by user")
  );
}

export function getReadableFirebaseErrorMessage(error: unknown): string {
  if (!error) return "An unknown error occurred.";

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || "";

  // Explicit DeadlineIQ custom error codes
  if (
    code === "deadlineiq/no-google-account" ||
    code === "deadlineiq/no-account-found" ||
    message.includes("No DeadlineIQ account found for this Google account")
  ) {
    return "No DeadlineIQ account found for this Google account. Please use Create Account first.";
  }

  if (
    code === "deadlineiq/no-email-account" ||
    code === "auth/user-not-found" ||
    message.includes("No DeadlineIQ account exists with this email")
  ) {
    return "No DeadlineIQ account exists with this email. Please create an account first.";
  }

  if (
    code === "deadlineiq/account-already-exists" ||
    code === "auth/email-already-in-use" ||
    message.includes("An account with this email already exists") ||
    message.includes("already registered")
  ) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (
    message.includes("auth/unauthorized-domain") ||
    message.includes("unauthorized-domain")
  ) {
    const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
    return `Firebase domain unauthorized: "${host}" needs to be added to Authorized Domains in Firebase Console > Authentication > Settings. In the meantime, use Email/Password or Demo sign-in.`;
  }

  if (code === "auth/wrong-password" || message.includes("auth/wrong-password")) {
    return "Incorrect password. Please try again.";
  }

  if (
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials" ||
    message.includes("auth/invalid-credential") ||
    message.includes("INVALID_LOGIN_CREDENTIALS")
  ) {
    return "Incorrect email or password. Please verify your credentials or create an account.";
  }

  if (message.includes("auth/invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (message.includes("auth/weak-password")) {
    return "Password must be at least 6 characters long.";
  }
  if (message.includes("auth/too-many-requests")) {
    return "Too many failed attempts. Please wait a minute and try again.";
  }
  if (isAuthCancelledError(error)) {
    return "";
  }
  if (message.includes("auth/popup-blocked")) {
    return "The sign-in popup was blocked by your browser. Please allow popups for this site.";
  }
  if (
    code === "auth/network-request-failed" ||
    message.includes("auth/network-request-failed") ||
    message.includes("network-request-failed")
  ) {
    return "Network connection issue during sign-in. Please check your connection or continue with Email/Password.";
  }
  if (message.includes("auth/operation-not-allowed")) {
    return "This sign-in provider is currently disabled in your Firebase console.";
  }
  if (message.includes("permission-denied") || message.includes("Missing or insufficient permissions")) {
    return "Access denied: You only have permission to view and edit your own academic records.";
  }
  if (message.includes("unavailable") || message.includes("network") || message.includes("offline")) {
    return "Network unavailable: Working in local offline mode. Changes will sync when reconnected.";
  }
  if (message.includes("unauthenticated")) {
    return "Session expired: Please log in again to continue.";
  }
  if (message.includes("not-found")) {
    return "The requested academic item could not be found.";
  }
  if (message.includes("quota-exceeded")) {
    return "Cloud service quota reached for today. Local storage remains fully operational.";
  }

  return message.length < 120 && !message.includes("{") ? message : "An authentication error occurred. Please try again.";
}
