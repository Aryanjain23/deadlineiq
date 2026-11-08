/**
 * Unified Google Workspace Auth Manager for DeadlineIQ
 *
 * Provides single, unified Google OAuth 2.0 authorization for both Gmail and Google Calendar
 * using the project's single OAuth Client ID.
 *
 * Scopes requested in one sign-in:
 * - https://www.googleapis.com/auth/gmail.readonly
 * - https://www.googleapis.com/auth/calendar.readonly
 * - https://www.googleapis.com/auth/calendar.events
 * - https://www.googleapis.com/auth/calendar.calendarlist.readonly
 */

import appletConfig from "../../../firebase-applet-config.json";
import {
  setGoogleAccessToken,
  clearGoogleAccessToken,
  getGoogleCalendarMeta,
  saveGoogleCalendarMeta,
  ensureGoogleIdentityServices,
  type GoogleCalendarMeta,
} from "./googleCalendar";
import {
  setGmailAccessToken,
  clearGmailAccessToken,
  getGmailMeta,
  saveGmailMeta,
  syncGmailTasks,
  type GmailMeta,
} from "./gmail";

export const UNIFIED_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

/**
 * Gets the single Google OAuth Client ID from environment or applet configuration.
 */
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

/**
 * Validates if OAuth Client ID is configured.
 */
export function isGoogleOAuthConfigured(): boolean {
  const clientId = getGoogleOAuthClientId();
  return Boolean(clientId && !clientId.startsWith("YOUR_") && clientId.includes(".apps.googleusercontent.com"));
}

/**
 * Requests unified Google access for both Gmail and Google Calendar in a single sign-in flow.
 * Upon successful authorization, saves access tokens for both services,
 * fetches user's email, and sets both Gmail and Google Calendar status to Connected.
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
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: UNIFIED_GOOGLE_SCOPES,
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error("Unified Google OAuth error:", tokenResponse.error);
            reject(new Error(tokenResponse.error_description || tokenResponse.error || "Google authorization failed."));
            return;
          }

          if (!tokenResponse.access_token) {
            reject(new Error("No access token was returned by Google Identity Services."));
            return;
          }

          const accessToken = tokenResponse.access_token;
          const expiresIn = Number(tokenResponse.expires_in) || 3599;

          // 1. Save access token in memory for both Calendar & Gmail services
          setGoogleAccessToken(accessToken, expiresIn);
          setGmailAccessToken(accessToken, expiresIn);

          // 2. Fetch connected email address from Google
          let connectedEmail = "Primary Account";
          try {
            const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (profileRes.ok) {
              const pData = await profileRes.json();
              if (pData.email) connectedEmail = pData.email;
            } else {
              // Fallback to Gmail user profile
              const gmailRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (gmailRes.ok) {
                const gData = await gmailRes.json();
                if (gData.emailAddress) connectedEmail = gData.emailAddress;
              }
            }
          } catch (err) {
            console.warn("Could not fetch user info:", err);
          }

          const now = new Date().toISOString();

          // 3. Mark Google Calendar as Connected
          const calMeta = getGoogleCalendarMeta(userUid);
          const updatedCalMeta: GoogleCalendarMeta = {
            ...calMeta,
            isConnected: true,
            connectedEmail,
            lastSyncTime: now,
          };
          saveGoogleCalendarMeta(userUid, updatedCalMeta);

          // 4. Mark Gmail as Connected
          const gmMeta = getGmailMeta(userUid);
          const updatedGmMeta: GmailMeta = {
            ...gmMeta,
            isConnected: true,
            connectedEmail,
            lastSyncTime: now,
          };
          saveGmailMeta(userUid, updatedGmMeta);

          // 5. Trigger background task import from Gmail automatically
          try {
            syncGmailTasks(userUid, false).catch((err) => {
              console.warn("Initial Gmail background sync note:", err);
            });
          } catch {}

          resolve({
            accessToken,
            connectedEmail,
            calendarMeta: updatedCalMeta,
            gmailMeta: updatedGmMeta,
          });
        },
      });

      client.requestAccessToken({ prompt: "consent" });
    } catch (err: any) {
      reject(new Error(err?.message || "Failed to initialize Google authorization popup."));
    }
  });
}

/**
 * Disconnects both Google Calendar and Gmail integrations simultaneously.
 */
export function disconnectUnifiedGoogleAccess(userUid: string): void {
  clearGoogleAccessToken();
  clearGmailAccessToken();

  const calMeta = getGoogleCalendarMeta(userUid);
  saveGoogleCalendarMeta(userUid, {
    ...calMeta,
    isConnected: false,
  });

  const gmMeta = getGmailMeta(userUid);
  saveGmailMeta(userUid, {
    ...gmMeta,
    isConnected: false,
  });
}
