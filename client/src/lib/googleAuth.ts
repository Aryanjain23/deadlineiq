/**
 * Unified Google Workspace Auth Manager for DeadlineIQ
 *
 * Implements a robust, server-driven OAuth 2.0 authorization code flow
 * (no Google Identity Services popup code flow or fragile 'postmessage' redirect URI).
 * Directly opens /api/auth/google/start?service=...&uid=... in a popup, handles callback
 * via postMessage, and manages per-service access & refresh tokens via the server.
 */

import appletConfig from "../../../firebase-applet-config.json";
import {
  setGoogleAccessToken,
  getGoogleAccessToken,
  clearGoogleAccessToken,
  getGoogleCalendarMeta,
  saveGoogleCalendarMeta,
  type GoogleCalendarMeta,
} from "./googleCalendar";
import {
  setGmailAccessToken,
  getGmailAccessToken,
  clearGmailAccessToken,
  getGmailMeta,
  saveGmailMeta,
  type GmailMeta,
} from "./gmail";

export function getGoogleOAuthClientId(): string {
  const envClientId =
    import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID ||
    (import.meta.env as any).VITE_GOOGLE_CLIENT_ID;
  if (envClientId && typeof envClientId === "string" && envClientId.trim() !== "") {
    return envClientId.trim();
  }

  if (appletConfig && (appletConfig as any).oAuthClientId) {
    return (appletConfig as any).oAuthClientId;
  }

  return "";
}

export function isGoogleOAuthConfigured(): boolean {
  const clientId = getGoogleOAuthClientId();
  return Boolean(clientId && !clientId.startsWith("YOUR_") && clientId.includes(".apps.googleusercontent.com"));
}

/**
 * Gets a valid access token for the given user and service.
 * Checks in-memory cache first, then calls /api/google/oauth/token (which automatically
 * refreshes using server-stored refresh tokens and retries on 401).
 */
export async function getValidGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" = "calendar"
): Promise<string | null> {
  if (!userUid) return null;

  // 1. Check in-memory token cache
  const cached = service === "gmail" ? getGmailAccessToken() : getGoogleAccessToken();
  if (cached) return cached;

  // 2. Fetch or refresh from server token endpoint
  try {
    const res = await fetch(`/api/google/oauth/token?uid=${encodeURIComponent(userUid)}&service=${service}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.accessToken) {
        if (service === "gmail") {
          setGmailAccessToken(data.accessToken, 3599);
        } else {
          setGoogleAccessToken(data.accessToken, 3599);
        }
        return data.accessToken;
      }
    } else if (res.status === 401) {
      // Reconnect required
      if (service === "calendar") {
        const calMeta = getGoogleCalendarMeta(userUid);
        saveGoogleCalendarMeta(userUid, { ...calMeta, isConnected: false });
        clearGoogleAccessToken();
      } else {
        const gmMeta = getGmailMeta(userUid);
        saveGmailMeta(userUid, { ...gmMeta, isConnected: false });
        clearGmailAccessToken();
      }
    }
  } catch (err) {
    console.warn(`Error getting ${service} access token from server:`, err);
  }

  return null;
}

/**
 * Explicit token refresh helper for backward compatibility.
 */
export async function refreshGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" | "unified" = "unified"
): Promise<string | null> {
  if (!userUid) return null;

  if (service === "unified") {
    const calToken = await getValidGoogleAccessToken(userUid, "calendar");
    const gmToken = await getValidGoogleAccessToken(userUid, "gmail");
    return calToken || gmToken;
  }

  return getValidGoogleAccessToken(userUid, service);
}

export interface GoogleAuthPopupResult {
  accessToken: string;
  connectedEmail: string;
  calendarMeta: GoogleCalendarMeta;
  gmailMeta: GmailMeta;
}

/**
 * Launches the server-driven Google OAuth authorization popup.
 *
 * Directs browser to /api/auth/google/start?service=...&uid=..., where the server generates
 * an HMAC-signed state, uses the exact redirect URI matching the request origin, and requests
 * only the necessary scopes for that service.
 *
 * Listens for the postMessage event sent by the callback page upon completion.
 */
export async function openGoogleAuthPopup(
  userUid: string,
  service: "gmail" | "calendar" | "unified" = "calendar"
): Promise<GoogleAuthPopupResult> {
  if (!userUid) {
    throw new Error("User UID is required to connect Google account.");
  }

  const width = 540;
  const height = 680;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

  const startUrl = `/api/auth/google/start?service=${encodeURIComponent(service)}&uid=${encodeURIComponent(userUid)}`;

  const popup = window.open(
    startUrl,
    "deadlineiq_google_oauth_popup",
    `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no`
  );

  if (!popup) {
    throw new Error("Unable to open popup window. Please allow popups for this site and try again.");
  }

  return new Promise((resolve, reject) => {
    let isFinished = false;

    const handleMessage = async (event: MessageEvent) => {
      // Validate event type
      if (!event.data || event.data.type !== "google-auth") {
        return;
      }

      cleanup();
      isFinished = true;

      if (!event.data.ok) {
        const errMessage = event.data.error || "Google authorization failed.";
        reject(new Error(errMessage));
        return;
      }

      try {
        const connectedEmail = event.data.connectedEmail || "Primary Account";
        const now = new Date().toISOString();

        let accessToken = "";
        const target = service === "unified" ? "calendar" : service;

        // Fetch fresh access token from server endpoint
        const tokenRes = await fetch(`/api/google/oauth/token?uid=${encodeURIComponent(userUid)}&service=${target}`);
        if (tokenRes.ok) {
          const tData = await tokenRes.json();
          accessToken = tData.accessToken || "";
        }

        let updatedCalMeta = getGoogleCalendarMeta(userUid);
        let updatedGmMeta = getGmailMeta(userUid);

        if (service === "calendar" || service === "unified") {
          if (accessToken) setGoogleAccessToken(accessToken, 3599);
          updatedCalMeta = {
            ...updatedCalMeta,
            isConnected: true,
            connectedEmail,
            lastSyncTime: now,
          };
          saveGoogleCalendarMeta(userUid, updatedCalMeta);
        }

        if (service === "gmail" || service === "unified") {
          let gmToken = accessToken;
          if (service === "unified") {
            const gmRes = await fetch(`/api/google/oauth/token?uid=${encodeURIComponent(userUid)}&service=gmail`);
            if (gmRes.ok) {
              const gmData = await gmRes.json();
              gmToken = gmData.accessToken || accessToken;
            }
          }
          if (gmToken) setGmailAccessToken(gmToken, 3599);
          updatedGmMeta = {
            ...updatedGmMeta,
            isConnected: true,
            connectedEmail,
            lastSyncTime: now,
          };
          saveGmailMeta(userUid, updatedGmMeta);
        }

        resolve({
          accessToken,
          connectedEmail,
          calendarMeta: updatedCalMeta,
          gmailMeta: updatedGmMeta,
        });
      } catch (err: any) {
        reject(new Error(err?.message || "Failed to initialize connected session."));
      }
    };

    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        if (!isFinished) {
          reject(new Error("Authorization popup was closed before completing sign-in."));
        }
      }
    }, 600);

    const cleanup = () => {
      clearInterval(timer);
      window.removeEventListener("message", handleMessage);
    };

    window.addEventListener("message", handleMessage);
  });
}

/**
 * Backward compatibility alias so existing callers seamlessly use the new server-driven flow.
 */
export const requestUnifiedGoogleAccess = openGoogleAuthPopup;

/**
 * Revokes Google OAuth access for a user and service, deleting server-stored refresh token.
 * Disconnecting one service never clears or invalidates the other service.
 */
export async function disconnectUnifiedGoogleAccess(
  userUid: string,
  service: "gmail" | "calendar" | "all" = "all"
): Promise<void> {
  if (service === "calendar" || service === "all") {
    clearGoogleAccessToken();
    const calMeta = getGoogleCalendarMeta(userUid);
    saveGoogleCalendarMeta(userUid, {
      ...calMeta,
      isConnected: false,
    });
  }

  if (service === "gmail" || service === "all") {
    clearGmailAccessToken();
    const gmMeta = getGmailMeta(userUid);
    saveGmailMeta(userUid, {
      ...gmMeta,
      isConnected: false,
    });
  }

  try {
    await fetch("/api/google/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userUid, service }),
    });
  } catch (err) {
    console.warn("Server revoke request notice:", err);
  }
}

/**
 * Performs a live test of the user's connection to Gmail or Calendar.
 * Makes a real API call on the server to verify active token and scopes.
 */
export async function testGoogleConnection(
  userUid: string,
  service: "gmail" | "calendar"
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  errorCode?: string;
  details?: any;
}> {
  try {
    const res = await fetch("/api/google/oauth/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: userUid, service }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Failed to contact connection verification endpoint.",
      error: err?.message,
      errorCode: "network_error",
    };
  }
}
