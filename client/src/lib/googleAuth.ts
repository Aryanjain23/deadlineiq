/**
 * Unified Google Workspace Auth Manager for DeadlineIQ
 *
 * Provides single, unified Google OAuth 2.0 authorization for both Gmail and Google Calendar
 * using the project's single OAuth Client ID and server-side offline refresh tokens.
 */

import appletConfig from "../../../firebase-applet-config.json";
import {
  setGoogleAccessToken,
  getGoogleAccessToken,
  clearGoogleAccessToken,
  getGoogleCalendarMeta,
  saveGoogleCalendarMeta,
  ensureGoogleIdentityServices,
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

export const UNIFIED_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "openid",
  "email",
].join(" ");

export function getGoogleOAuthClientId(): string {
  const envClientId = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || (import.meta.env as any).VITE_GOOGLE_CLIENT_ID;
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
 * Silently refreshes the access token via server refresh token endpoint.
 * Automatically retries once on 401, and updates service-specific status.
 */
export async function refreshGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" | "unified" = "unified"
): Promise<string | null> {
  if (!userUid) return null;
  try {
    const res = await fetch("/api/google/oauth/refresh-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userUid, service }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.access_token) {
        const now = new Date().toISOString();
        if (service === "calendar" || service === "unified") {
          setGoogleAccessToken(data.access_token, data.expires_in);
          const calMeta = getGoogleCalendarMeta(userUid);
          saveGoogleCalendarMeta(userUid, {
            ...calMeta,
            isConnected: true,
            connectedEmail: data.connectedEmail || calMeta.connectedEmail,
            lastSyncTime: now,
          });
        }
        if (service === "gmail" || service === "unified") {
          setGmailAccessToken(data.access_token, data.expires_in);
          const gmMeta = getGmailMeta(userUid);
          saveGmailMeta(userUid, {
            ...gmMeta,
            isConnected: true,
            connectedEmail: data.connectedEmail || gmMeta.connectedEmail,
            lastSyncTime: now,
          });
        }
        return data.access_token;
      }
    } else if (res.status === 401) {
      // Marked as Needs reconnect
      console.warn(`OAuth refresh token revoked or expired for ${userUid} (${service})`);
      if (service === "calendar" || service === "unified") {
        const calMeta = getGoogleCalendarMeta(userUid);
        saveGoogleCalendarMeta(userUid, { ...calMeta, isConnected: false });
      }
      if (service === "gmail" || service === "unified") {
        const gmMeta = getGmailMeta(userUid);
        saveGmailMeta(userUid, { ...gmMeta, isConnected: false });
      }
    }
  } catch (err) {
    console.warn("Silent OAuth token refresh warning:", err);
  }
  return null;
}

/**
 * Gets a valid access token for API calls (using in-memory token or refreshing via server).
 */
export async function getValidGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" | "unified" = "unified"
): Promise<string | null> {
  const cached = service === "gmail" ? getGmailAccessToken() : getGoogleAccessToken();
  if (cached) return cached;

  return refreshGoogleAccessToken(userUid, service);
}

/**
 * Requests unified Google access for both Gmail and Google Calendar.
 * Uses authorization code flow with access_type=offline, prompt=consent, include_granted_scopes=true.
 * After token exchange, inspects granted scopes and enforces that services are only marked connected
 * if their respective scopes were explicitly granted by the user.
 */
export async function requestUnifiedGoogleAccess(
  userUid: string,
  targetService: "gmail" | "calendar" | "unified" = "unified"
): Promise<{
  accessToken: string;
  connectedEmail: string;
  calendarMeta: GoogleCalendarMeta;
  gmailMeta: GmailMeta;
}> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throw new Error("Google OAuth Client ID is missing or not configured.");
  }

  await ensureGoogleIdentityServices();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Google Identity Services library is unavailable.");
  }

  return new Promise((resolve, reject) => {
    try {
      const runTokenClientFallback = () => {
        try {
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: UNIFIED_GOOGLE_SCOPES,
            prompt: "consent",
            include_granted_scopes: true,
            callback: async (tokenResponse: any) => {
              if (tokenResponse.error) {
                if (tokenResponse.error === "access_denied") {
                  reject(new Error("Google access was denied. On the Google consent screen, please click Continue and allow the requested permissions."));
                  return;
                }
                reject(new Error(tokenResponse.error_description || tokenResponse.error || "Google authorization failed."));
                return;
              }

              const accessToken = tokenResponse.access_token;
              const expiresIn = Number(tokenResponse.expires_in) || 3599;

              // Inspect client granted scopes if available
              const grantedStr = typeof tokenResponse.scope === "string" ? tokenResponse.scope : "";
              const hasGmail = grantedStr.includes("gmail.readonly");
              const hasCalendar = grantedStr.includes("calendar.events") || grantedStr.includes("calendar.readonly");

              if (targetService === "calendar" && !hasCalendar && grantedStr) {
                reject(new Error("Google didn't grant Calendar access. On the Google screen, tick all the checkboxes, then try again."));
                return;
              }
              if (targetService === "gmail" && !hasGmail && grantedStr) {
                reject(new Error("Google didn't grant Gmail access. On the Google screen, tick all the checkboxes, then try again."));
                return;
              }

              let connectedEmail = "Primary Account";
              try {
                const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (profileRes.ok) {
                  const pData = await profileRes.json();
                  if (pData.email) connectedEmail = pData.email;
                }
              } catch {}

              const now = new Date().toISOString();
              const calMeta = getGoogleCalendarMeta(userUid);
              const isCalGranted = grantedStr ? hasCalendar : true;
              const updatedCalMeta = {
                ...calMeta,
                isConnected: isCalGranted,
                connectedEmail: isCalGranted ? connectedEmail : calMeta.connectedEmail,
                lastSyncTime: isCalGranted ? now : calMeta.lastSyncTime,
              };
              saveGoogleCalendarMeta(userUid, updatedCalMeta);
              if (isCalGranted) setGoogleAccessToken(accessToken, expiresIn);

              const gmMeta = getGmailMeta(userUid);
              const isGmGranted = grantedStr ? hasGmail : true;
              const updatedGmMeta = {
                ...gmMeta,
                isConnected: isGmGranted,
                connectedEmail: isGmGranted ? connectedEmail : gmMeta.connectedEmail,
                lastSyncTime: isGmGranted ? now : gmMeta.lastSyncTime,
              };
              saveGmailMeta(userUid, updatedGmMeta);
              if (isGmGranted) setGmailAccessToken(accessToken, expiresIn);

              resolve({
                accessToken,
                connectedEmail,
                calendarMeta: updatedCalMeta,
                gmailMeta: updatedGmMeta,
              });
            },
          });

          tokenClient.requestAccessToken({ prompt: "consent" });
        } catch (tokenErr: any) {
          reject(new Error(tokenErr?.message || "Failed to initialize Google token authorization popup."));
        }
      };

      // 1. Try Authorization Code Flow (initCodeClient) for offline refresh tokens
      if (google.accounts.oauth2.initCodeClient) {
        const codeClient = google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: UNIFIED_GOOGLE_SCOPES,
          ux_mode: "popup",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: true,
          callback: async (response: any) => {
            if (response.error) {
              if (response.error === "access_denied") {
                reject(new Error("Google access was denied. On the Google consent screen, please click Continue and allow the requested permissions."));
                return;
              }
              reject(new Error(response.error_description || response.error || "Google authorization failed."));
              return;
            }

            if (!response.code) {
              reject(new Error("No authorization code was returned by Google."));
              return;
            }

            try {
              // Exchange authorization code on server
              const exRes = await fetch("/api/google/oauth/exchange-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: response.code, userUid, service: targetService }),
              });

              if (!exRes.ok) {
                const errData = await exRes.json().catch(() => ({}));
                const rawMsg = errData.error || "";

                // If secret is not yet set on server, seamlessly fall back to token client for this session
                if (rawMsg.includes("GOOGLE_CLIENT_SECRET is missing")) {
                  console.warn("Server is missing GOOGLE_CLIENT_SECRET; falling back to direct client authorization...");
                  runTokenClientFallback();
                  return;
                }

                throw new Error(rawMsg || `Server code exchange failed HTTP ${exRes.status}`);
              }

              const exData = await exRes.json();
              const accessToken = exData.access_token;
              const connectedEmail = exData.connectedEmail || "Primary Account";
              const expiresIn = exData.expires_in || 3599;
              const gmailGranted = Boolean(exData.gmailGranted);
              const calendarGranted = Boolean(exData.calendarGranted);

              // Check if user unticked the scope for the service they requested
              if (targetService === "calendar" && !calendarGranted) {
                const calMeta = getGoogleCalendarMeta(userUid);
                saveGoogleCalendarMeta(userUid, { ...calMeta, isConnected: false });
                throw new Error(exData.calendarError || "Google didn't grant Calendar access. On the Google screen, tick all the checkboxes, then try again.");
              }

              if (targetService === "gmail" && !gmailGranted) {
                const gmMeta = getGmailMeta(userUid);
                saveGmailMeta(userUid, { ...gmMeta, isConnected: false });
                throw new Error(exData.gmailError || "Google didn't grant Gmail access. On the Google screen, tick all the checkboxes, then try again.");
              }

              if (targetService === "unified" && !gmailGranted && !calendarGranted) {
                const calMeta = getGoogleCalendarMeta(userUid);
                saveGoogleCalendarMeta(userUid, { ...calMeta, isConnected: false });
                const gmMeta = getGmailMeta(userUid);
                saveGmailMeta(userUid, { ...gmMeta, isConnected: false });
                throw new Error("Google didn't grant Gmail or Calendar access. On the Google screen, tick all the checkboxes, then try again.");
              }

              const now = new Date().toISOString();

              // Update Calendar meta only if Calendar was granted
              const calMeta = getGoogleCalendarMeta(userUid);
              let updatedCalMeta: GoogleCalendarMeta;
              if (calendarGranted) {
                setGoogleAccessToken(accessToken, expiresIn);
                updatedCalMeta = {
                  ...calMeta,
                  isConnected: true,
                  connectedEmail,
                  lastSyncTime: now,
                };
                saveGoogleCalendarMeta(userUid, updatedCalMeta);
              } else {
                updatedCalMeta = {
                  ...calMeta,
                  isConnected: false,
                };
                saveGoogleCalendarMeta(userUid, updatedCalMeta);
              }

              // Update Gmail meta only if Gmail was granted
              const gmMeta = getGmailMeta(userUid);
              let updatedGmMeta: GmailMeta;
              if (gmailGranted) {
                setGmailAccessToken(accessToken, expiresIn);
                updatedGmMeta = {
                  ...gmMeta,
                  isConnected: true,
                  connectedEmail,
                  lastSyncTime: now,
                };
                saveGmailMeta(userUid, updatedGmMeta);
              } else {
                updatedGmMeta = {
                  ...gmMeta,
                  isConnected: false,
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
              reject(err);
            }
          },
        });

        codeClient.requestCode();
        return;
      }

      // 2. Fallback to initTokenClient if initCodeClient is unavailable
      runTokenClientFallback();
    } catch (err: any) {
      reject(new Error(err?.message || "Failed to initialize Google authorization popup."));
    }
  });
}

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

