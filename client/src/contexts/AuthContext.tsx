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
  onFirebaseAuthStateChanged,
  isFirebaseConfigured,
  isAuthCancelledError,
} from "@/lib/firebase";
import { clearGoogleAccessToken } from "@/lib/googleCalendar";

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
          error?.code === "deadlineiq/no-google-account" ||
          error?.code === "deadlineiq/account-already-exists" ||
          String(error?.message).includes("auth/unauthorized-domain") ||
          String(error?.message).includes("unauthorized-domain");

        if (isExpectedAuthIssue) {
          console.warn("Google sign-in prevented:", error?.code || error?.message);
        } else {
          console.error("Google sign-in error:", error);
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
    try {
      clearGoogleAccessToken();
      await logOutFromFirebase();
    } catch (err) {
      console.warn("Firebase sign out error:", err);
    }
    clearSession();
    setUser(null);
  }, []);

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
