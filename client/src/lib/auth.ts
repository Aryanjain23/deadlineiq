export interface AuthUser {
  uid?: string;
  usn: string;
  name: string;
  email?: string | null;
  photoURL?: string | null;
  isFirebaseUser?: boolean;
}

export const DEMO_CREDENTIALS = {
  uid: "demo-aryan-4NI25EC023",
  usn: "4NI25EC023",
  password: "DeadlineIQ@2026",
  name: "Aryan",
};

const AUTH_STORAGE_KEY = "deadlineiq_session";

export function getSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    // Ensure uid is always populated even for legacy stored sessions
    if (!parsed.uid) {
      parsed.uid = `user-${(parsed.usn || "guest").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(user: AuthUser): void {
  try {
    const enrichedUser: AuthUser = {
      ...user,
      uid: user.uid || `user-${(user.usn || "guest").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(enrichedUser));
  } catch (error) {
    console.error("Failed to save auth session:", error);
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear auth session:", error);
  }
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}
