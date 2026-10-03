import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  getSession,
  setSession,
  clearSession,
  purgeUserLocalCaches,
  type AuthUser,
  DEMO_CREDENTIALS,
} from "@/lib/auth";
import {
  signInWithGoogle,
  checkRedirectResult,
  checkUserHasDeadlineIQAccount,
  signUpWithEmail as fbSignUpWithEmail,
  signInWithEmail as fbSignInWithEmail,
  sendPasswordReset as fbSendPasswordReset,
  logOutFromFirebase,
  deleteUserAccount,
  onFirebaseAuthStateChanged,
  isFirebaseConfigured,
  isAuthCancelledError,
  getFirebaseAuth,
} from "@/lib/firebase";
import { disconnectGoogleCalendar, clearGoogleAccessToken } from "@/lib/googleCalendar";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isFirebaseActive: boolean;
  loginWithDemo: (usn: string, pass: string) => boolean;
  loginWithGoogle: (mode?: "signin" | "signup") => Promise<AuthUser | null>;
  signUpWithEmail: (
    email: string,
    pass: string,
    displayName: string,
    usn?: string
  ) => Promise<AuthUser>;
  loginWithEmail: (email: string, pass: string) => Promise<AuthUser>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateUserContext: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getSession());
  const [isLoading, setIsLoading] = useState(true);
  const isFirebaseActive = isFirebaseConfigured();
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // Check for redirect result from Google sign-in redirect fallback
    checkRedirectResult().catch((err) => {
      console.warn("Redirect result check warning:", err);
    });

    // Listen to Firebase auth changes
    const unsubscribe = onFirebaseAuthStateChanged(async (firebaseUser) => {
      if (!isMounted) return;

      // If an explicit login / signup action is currently in progress,
      // do not let the auth change listener preempt or set session prematurely
      if (isAuthenticatingRef.current) {
        return;
      }

      if (firebaseUser) {
        // Enforce application-level check: only grant access if user possesses a DeadlineIQ account
        const hasAccount = await checkUserHasDeadlineIQAccount(firebaseUser);
        if (!hasAccount) {
          console.warn("Unregistered Firebase user detected on load. Rejecting access.");
          await logOutFromFirebase();
          clearSession();
          setUser(null);
          setIsLoading(false);
          return;
        }

        const local = getSession();
        const primaryUsn = local?.usn || "";
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          usn: primaryUsn,
          name: firebaseUser.displayName || local?.name || "Student",
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          isFirebaseUser: true,
        };
        setUser(authUser);
        setSession(authUser);
      } else {
        // Fall back to local session only if it's a demo account
        const localSession = getSession();
        if (localSession && !localSession.isFirebaseUser) {
          setUser(localSession);
        } else {
          setUser(null);
          clearSession();
        }
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const loginWithDemo = useCallback((usn: string, pass: string): boolean => {
    const cleanUsn = usn.trim();
    if (
      cleanUsn.toUpperCase() === DEMO_CREDENTIALS.usn.toUpperCase() &&
      pass === DEMO_CREDENTIALS.password
    ) {
      const demoUser: AuthUser = {
        uid: DEMO_CREDENTIALS.uid,
        usn: DEMO_CREDENTIALS.usn,
        name: DEMO_CREDENTIALS.name,
        email: "student@nie.ac.in",
        isFirebaseUser: false,
      };
      setUser(demoUser);
      setSession(demoUser);
      return true;
    }
    return false;
  }, []);

  const loginWithGoogle = useCallback(
    async (mode: "signin" | "signup" = "signin"): Promise<AuthUser | null> => {
      isAuthenticatingRef.current = true;
      try {
        const fbUser = await signInWithGoogle(mode, true);
        if (!fbUser) return null;

        const local = getSession();
        const authUser: AuthUser = {
          uid: fbUser.uid,
          usn: local?.usn || "",
          name: fbUser.displayName || "Student",
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          isFirebaseUser: true,
        };
        setUser(authUser);
        setSession(authUser);
        return authUser;
      } catch (error: any) {
        if (isAuthCancelledError(error)) {
          return null;
        }

        const isExpectedAuthIssue =
          error?.code === "auth/unauthorized-domain" ||
          error?.code === "auth/network-request-failed" ||
          error?.code === "auth/popup-blocked" ||
          error?.code === "auth/cancelled-popup-request" ||
          error?.code === "auth/popup-closed-by-user" ||
          error?.code === "deadlineiq/no-google-account" ||
          error?.code === "deadlineiq/account-already-exists" ||
          String(error?.message).includes("auth/unauthorized-domain") ||
          String(error?.message).includes("unauthorized-domain") ||
          String(error?.message).includes("network-request-failed");

        if (isExpectedAuthIssue) {
          console.warn("Google sign-in prevented:", error?.code || error?.message);
        } else {
          console.warn("Google sign-in issue:", error?.code || error?.message);
        }
        throw error;
      } finally {
        isAuthenticatingRef.current = false;
      }
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      pass: string,
      displayName: string,
      usn?: string
    ): Promise<AuthUser> => {
      isAuthenticatingRef.current = true;
      try {
        const fbUser = await fbSignUpWithEmail(email, pass, displayName, usn);
        const authUser: AuthUser = {
          uid: fbUser.uid,
          usn: usn?.trim() || "",
          name: displayName.trim() || fbUser.displayName || "Student",
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          isFirebaseUser: true,
        };
        setUser(authUser);
        setSession(authUser);
        return authUser;
      } finally {
        isAuthenticatingRef.current = false;
      }
    },
    []
  );

  const loginWithEmail = useCallback(
    async (email: string, pass: string): Promise<AuthUser> => {
      isAuthenticatingRef.current = true;
      try {
        const fbUser = await fbSignInWithEmail(email, pass);
        const local = getSession();
        const authUser: AuthUser = {
          uid: fbUser.uid,
          usn: local?.usn || "",
          name: fbUser.displayName || "Student",
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          isFirebaseUser: true,
        };
        setUser(authUser);
        setSession(authUser);
        return authUser;
      } finally {
        isAuthenticatingRef.current = false;
      }
    },
    []
  );

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    await fbSendPasswordReset(email);
  }, []);

  const logout = useCallback(async () => {
    isAuthenticatingRef.current = true;
    const currentUid = user?.uid;
    const currentUsn = user?.usn;
    try {
      if (currentUid) {
        await disconnectGoogleCalendar(currentUid);
      }
      clearGoogleAccessToken();
      await logOutFromFirebase();
    } catch (err) {
      console.warn("Firebase sign out error:", err);
    } finally {
      purgeUserLocalCaches(currentUid, currentUsn);
      clearSession();
      setUser(null);
      isAuthenticatingRef.current = false;
    }
  }, [user]);

  const deleteAccount = useCallback(async () => {
    if (!user) return;
    isAuthenticatingRef.current = true;
    const currentUid = user.uid;
    const currentEmail = user.email || undefined;
    const currentUsn = user.usn;

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;

      if (currentUser && currentUid) {
        try {
          const idToken = await currentUser.getIdToken(true);

          const res = await fetch("/api/auth/delete-account", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ email: currentEmail }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.warn("Server delete-account endpoint error:", errData);
          }
        } catch (serverErr) {
          console.warn("Could not execute server deletion:", serverErr);
        }

        try {
          await deleteUserAccount(currentUid, currentEmail);
        } catch {}
      }

      if (currentUid) {
        await disconnectGoogleCalendar(currentUid);
      }

      await logOutFromFirebase();
      purgeUserLocalCaches(currentUid, currentUsn);
      clearSession();
      setUser(null);
    } catch (err) {
      console.warn("Account deletion error:", err);
      purgeUserLocalCaches(currentUid, currentUsn);
      clearSession();
      setUser(null);
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [user]);

  const updateUserContext = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      setSession(updated);
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isFirebaseActive,
        loginWithDemo,
        loginWithGoogle,
        signUpWithEmail,
        loginWithEmail,
        resetPassword,
        logout,
        deleteAccount,
        updateUserContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
