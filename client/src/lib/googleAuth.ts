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
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
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
        setGoogleAccessToken(data.access_token, data.expires_in);
        setGmailAccessToken(data.access_token, data.expires_in);

        const now = new Date().toISOString();
        if (service === "calendar" || service === "unified") {
          const calMeta = getGoogleCalendarMeta(userUid);
          saveGoogleCalendarMeta(userUid, {
            ...calMeta,
            isConnected: true,
            connectedEmail: data.connectedEmail || calMeta.connectedEmail,
            lastSyncTime: now,
          });
        }
        if (service === "gmail" || service === "unified") {
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
      // Refresh token invalid or revoked: set status to reconnect required
      console.warn(`OAuth refresh token revoked for ${userUid} (${service})`);
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
 * Uses authorization code flow (initCodeClient) with access_type=offline and prompt=consent
 * to exchange authorization code for server-side refresh tokens.
 */
export async function requestUnifiedGoogleAccess(
  userUid: string
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
            callback: async (tokenResponse: any) => {
              if (tokenResponse.error) {
                reject(new Error(tokenResponse.error_description || tokenResponse.error || "Google authorization failed."));
                return;
              }

              const accessToken = tokenResponse.access_token;
              const expiresIn = Number(tokenResponse.expires_in) || 3599;

              setGoogleAccessToken(accessToken, expiresIn);
              setGmailAccessToken(accessToken, expiresIn);

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
              const updatedCalMeta = { ...calMeta, isConnected: true, connectedEmail, lastSyncTime: now };
              saveGoogleCalendarMeta(userUid, updatedCalMeta);

              const gmMeta = getGmailMeta(userUid);
              const updatedGmMeta = { ...gmMeta, isConnected: true, connectedEmail, lastSyncTime: now };
              saveGmailMeta(userUid, updatedGmMeta);

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
          callback: async (response: any) => {
            if (response.error) {
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
                body: JSON.stringify({ code: response.code, userUid, service: "unified" }),
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

              setGoogleAccessToken(accessToken, expiresIn);
              setGmailAccessToken(accessToken, expiresIn);

              const now = new Date().toISOString();

              const calMeta = getGoogleCalendarMeta(userUid);
              const updatedCalMeta: GoogleCalendarMeta = {
                ...calMeta,
                isConnected: true,
                connectedEmail,
                lastSyncTime: now,
              };
              saveGoogleCalendarMeta(userUid, updatedCalMeta);

              const gmMeta = getGmailMeta(userUid);
              const updatedGmMeta: GmailMeta = {
                ...gmMeta,
                isConnected: true,
                connectedEmail,
                lastSyncTime: now,
              };
              saveGmailMeta(userUid, updatedGmMeta);

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
 */
export async function disconnectUnifiedGoogleAccess(userUid: string, service: "gmail" | "calendar" | "all" = "all"): Promise<void> {
  clearGoogleAccessToken();
  clearGmailAccessToken();

  try {
    await fetch("/api/google/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userUid, service }),
    });
  } catch (err) {
    console.warn("Server revoke request notice:", err);
  }

  if (service === "calendar" || service === "all") {
    const calMeta = getGoogleCalendarMeta(userUid);
    saveGoogleCalendarMeta(userUid, {
      ...calMeta,
      isConnected: false,
    });
  }

  if (service === "gmail" || service === "all") {
    const gmMeta = getGmailMeta(userUid);
    saveGmailMeta(userUid, {
      ...gmMeta,
      isConnected: false,
    });
  }
}
