/**
 * DeadlineIQ Account Directory Service
 * Performs client/server verified account existence checks
 * for Sign In and Create Account modes.
 */

export interface AccountCheckResult {
  exists: boolean;
  email: string;
  displayName?: string;
  usn?: string;
}

/**
 * Checks whether an account exists for the given email address.
 */
export async function checkEmailRegistered(email: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) return false;

  try {
    const res = await fetch(`/api/auth/check-account?email=${encodeURIComponent(cleanEmail)}`);
    if (!res.ok) return false;
    const data: AccountCheckResult = await res.json();
    return Boolean(data.exists);
  } catch (err) {
    console.warn("Could not check account registry from server:", err);
    return false;
  }
}

/**
 * Registers an account in the DeadlineIQ directory.
 */
export async function recordAccountRegistration(
  email: string,
  uid?: string,
  displayName?: string,
  usn?: string
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;

  try {
    await fetch("/api/auth/register-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, uid, displayName, usn }),
    });
  } catch (err) {
    console.warn("Could not record account registration in server registry:", err);
  }
}

/**
 * Unregisters an account from the directory (used for temporary OAuth cleanup).
 */
export async function recordAccountUnregistration(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;

  try {
    await fetch("/api/auth/unregister-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail }),
    });
  } catch (err) {
    console.warn("Could not unregister temporary account from server registry:", err);
  }
}
