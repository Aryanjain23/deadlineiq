/**
 * Google Calendar Integration Module for DeadlineIQ
 *
 * Implements Google Identity Services (GIS) token client OAuth 2.0 authorization,
 * in-memory token lifecycle, Google Calendar v3 REST operations, multi-calendar support,
 * and two-way synchronization metadata management.
 */

import type { UnifiedCalendarItem } from "./calendar";
import type { CalendarEvent } from "./firebase/types";

// Minimum required scopes
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  description?: string;
  selected?: boolean;
}

export interface GoogleCalendarMeta {
  isConnected: boolean;
  connectedEmail?: string;
  lastSyncTime?: string;
  selectedCalendarIds: string[];
  calendars: GoogleCalendarListItem[];
}

export type GoogleSyncStatus =
  | "idle"
  | "connecting"
  | "syncing"
  | "success"
  | "error"
  | "expired"
  | "revoked";

export interface GoogleCalendarError {
  type:
    | "missing_config"
    | "denied"
    | "revoked"
    | "expired"
    | "network"
    | "quota"
    | "unknown";
  message: string;
  status?: number;
}

// In-memory token storage (never persisted to Firestore or localStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0; // Unix timestamp ms

/**
 * Gets the OAuth Client ID from environment variables or applet configuration.
 * Strictly never hardcodes secrets or client IDs in source code.
 */
export function getGoogleOAuthClientId(): string {
  // 1. Check primary environment variable
  const envClientId = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID;
  if (envClientId && typeof envClientId === "string" && envClientId.trim() !== "") {
    return envClientId.trim();
  }

  // 2. Return empty string if not configured
  return "";
}

/**
 * Validates if OAuth Client ID is properly configured.
 */
export function isGoogleCalendarConfigured(): boolean {
  const clientId = getGoogleOAuthClientId();
  return Boolean(clientId && !clientId.startsWith("YOUR_") && clientId.includes(".apps.googleusercontent.com"));
}

/**
 * Retrieves cached in-memory access token if valid and not expired.
 */
export function getGoogleAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  // Expire 60 seconds before actual deadline to prevent mid-flight 401s
  if (Date.now() >= tokenExpiresAt - 60000) {
    cachedAccessToken = null;
    return null;
  }
  return cachedAccessToken;
}

/**
 * Sets the cached in-memory access token.
 */
export function setGoogleAccessToken(token: string, expiresInSeconds: number = 3599): void {
  cachedAccessToken = token;
  tokenExpiresAt = Date.now() + Math.max(300, expiresInSeconds) * 1000;
}

/**
 * Clears the cached in-memory access token (e.g. on logout or disconnect).
 */
export function clearGoogleAccessToken(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

/**
 * Reads user's local Google Calendar connection metadata.
 */
export function getGoogleCalendarMeta(uid: string): GoogleCalendarMeta {
  const cleanUid = (uid || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  const key = `deadlineiq_gcal_meta_${cleanUid}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isConnected: Boolean(parsed.isConnected),
        connectedEmail: parsed.connectedEmail || undefined,
        lastSyncTime: parsed.lastSyncTime || undefined,
        selectedCalendarIds: Array.isArray(parsed.selectedCalendarIds)
          ? parsed.selectedCalendarIds
          : ["primary"],
        calendars: Array.isArray(parsed.calendars) ? parsed.calendars : [],
      };
    }
  } catch (err) {
    console.warn("Failed to load Google Calendar metadata:", err);
  }
  return {
    isConnected: false,
    selectedCalendarIds: ["primary"],
    calendars: [],
  };
}

/**
 * Persists user's local Google Calendar connection metadata (without sensitive tokens).
 */
export function saveGoogleCalendarMeta(uid: string, meta: GoogleCalendarMeta): void {
  const cleanUid = (uid || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  const key = `deadlineiq_gcal_meta_${cleanUid}`;
  try {
    localStorage.setItem(key, JSON.stringify(meta));
  } catch (err) {
    console.warn("Failed to save Google Calendar metadata:", err);
  }
}

/**
 * Helper to ensure Google Identity Services client script is loaded and ready.
 */
export function ensureGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }

    // Check if script element already exists
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services library.")));
      // Check periodically for a second
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 20) {
          clearInterval(interval);
          reject(new Error("Timed out waiting for Google Identity Services."));
        }
      }, 100);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Network failure loading Google Identity Services library."));
    document.head.appendChild(script);
  });
}

/**
 * Initiates the Google Identity Services token authorization flow.
 * Shows official Google OAuth consent modal asking permission for calendar scopes.
 */
export async function requestGoogleCalendarAccess(): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    const err: GoogleCalendarError = {
      type: "missing_config",
      message: "Google Calendar Client ID is not configured (VITE_GOOGLE_CALENDAR_CLIENT_ID missing).",
    };
    throw err;
  }

  await ensureGoogleIdentityServices();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    const err: GoogleCalendarError = {
      type: "network",
      message: "Google Identity Services is not available. Please check your internet connection.",
    };
    throw err;
  }

  return new Promise((resolve, reject) => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_CALENDAR_SCOPES,
        callback: (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error("GIS Token Client error:", tokenResponse.error);
            if (tokenResponse.error === "access_denied") {
              const err: GoogleCalendarError = {
                type: "denied",
                message: "Access to Google Calendar was denied or cancelled.",
              };
              reject(err);
            } else {
              const err: GoogleCalendarError = {
                type: "unknown",
                message: `Google authorization failed: ${tokenResponse.error_description || tokenResponse.error}`,
              };
              reject(err);
            }
            return;
          }

          if (!tokenResponse.access_token) {
            const err: GoogleCalendarError = {
              type: "unknown",
              message: "No access token was returned by Google Identity Services.",
            };
            reject(err);
            return;
          }

          const expiresIn = Number(tokenResponse.expires_in) || 3599;
          setGoogleAccessToken(tokenResponse.access_token, expiresIn);
          resolve({ accessToken: tokenResponse.access_token, expiresIn });
        },
        error_callback: (nonOAuthError: any) => {
          console.warn("GIS non-OAuth error:", nonOAuthError);
          const err: GoogleCalendarError = {
            type: "denied",
            message: nonOAuthError.message || "Google Calendar authorization popup closed or cancelled.",
          };
          reject(err);
        },
      });

      // Prompt user with GIS popup consent
      client.requestAccessToken({ prompt: "" });
    } catch (error: any) {
      console.error("Failed to initialize GIS token client:", error);
      const err: GoogleCalendarError = {
        type: "unknown",
        message: error.message || "Could not launch Google Calendar authorization flow.",
      };
      reject(err);
    }
  });
}

/**
 * Revokes Google Calendar access and cleans up state safely.
 * Does NOT delete any DeadlineIQ native events.
 */
export async function disconnectGoogleCalendar(uid: string): Promise<void> {
  const token = cachedAccessToken;
  clearGoogleAccessToken();

  // Reset metadata
  const meta = getGoogleCalendarMeta(uid);
  meta.isConnected = false;
  meta.connectedEmail = undefined;
  meta.lastSyncTime = undefined;
  saveGoogleCalendarMeta(uid, meta);

  // Attempt Google token revocation if available
  if (token) {
    try {
      if (typeof window !== "undefined" && (window as any).google?.accounts?.oauth2?.revoke) {
        (window as any).google.accounts.oauth2.revoke(token, () => {
          // Token revoked callback
        });
      } else {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("Google token revocation notice:", err);
    }
  }
}

/**
 * Fetches the user's available Google Calendars (primary and secondary).
 */
export async function fetchGoogleCalendarList(token: string): Promise<GoogleCalendarListItem[]> {
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw await handleGoogleApiError(res);
    }

    const data = await res.json();
    const items: GoogleCalendarListItem[] = (data.items || []).map((item: any) => ({
      id: item.id,
      summary: item.summaryOverride || item.summary || "Calendar",
      primary: Boolean(item.primary),
      backgroundColor: item.backgroundColor || "#4285F4",
      foregroundColor: item.foregroundColor || "#FFFFFF",
      description: item.description,
      selected: Boolean(item.selected ?? true),
    }));

    // Ensure primary is present at top
    items.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    return items;
  } catch (error: any) {
    throw normalizeError(error);
  }
}

/**
 * Fetches events from specified Google Calendar for a date range.
 */
export async function fetchGoogleCalendarEvents(
  token: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
  calendarName?: string
): Promise<UnifiedCalendarItem[]> {
  try {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set("timeMin", timeMinIso);
    url.searchParams.set("timeMax", timeMaxIso);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw await handleGoogleApiError(res);
    }

    const data = await res.json();
    const rawEvents = data.items || [];
    const unified: UnifiedCalendarItem[] = [];

    for (const ev of rawEvents) {
      if (ev.status === "cancelled") continue;

      let dateStr = "";
      let startTime: string | undefined;
      let endTime: string | undefined;
      let allDay = false;

      if (ev.start?.dateTime) {
        const startDt = new Date(ev.start.dateTime);
        dateStr = formatIsoDate(startDt);
        startTime = formatTime(startDt);

        if (ev.end?.dateTime) {
          const endDt = new Date(ev.end.dateTime);
          endTime = formatTime(endDt);
        }
      } else if (ev.start?.date) {
        dateStr = ev.start.date;
        allDay = true;
      }

      if (!dateStr) continue;

      unified.push({
        id: `gcal-${ev.id}`,
        itemType: "google",
        title: ev.summary || "(No Title)",
        date: dateStr,
        startTime,
        endTime,
        allDay,
        category: "Other",
        location: ev.location,
        notes: ev.description,
        isGoogleEvent: true,
        isGoogleSynced: true,
        googleEventId: ev.id,
        googleCalendarId: calendarId,
        googleCalendarName: calendarName || "Google Calendar",
        htmlLink: ev.htmlLink,
      });
    }

    return unified;
  } catch (error: any) {
    throw normalizeError(error);
  }
}

/**
 * Creates an event in user's Google Calendar.
 */
export async function createGoogleCalendarEvent(
  token: string,
  calendarId: string,
  event: Partial<CalendarEvent>
): Promise<{ id: string; htmlLink?: string }> {
  try {
    const isAllDay = Boolean(event.allDay || (!event.startTime && !event.endTime));
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    let startPayload: any;
    let endPayload: any;

    if (isAllDay) {
      startPayload = { date: event.date };
      // All day events in Google Calendar have end.date exclusive (next day)
      const nextDay = new Date(`${event.date}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      endPayload = { date: formatIsoDate(nextDay) };
    } else {
      const sTime = event.startTime || "10:00";
      const eTime = event.endTime || addOneHour(sTime);
      startPayload = { dateTime: `${event.date}T${sTime}:00`, timeZone };
      endPayload = { dateTime: `${event.date}T${eTime}:00`, timeZone };
    }

    const body = {
      summary: event.title || "DeadlineIQ Event",
      description: event.notes || "",
      location: event.location || "",
      start: startPayload,
      end: endPayload,
    };

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw await handleGoogleApiError(res);
    }

    const created = await res.json();
    return { id: created.id, htmlLink: created.htmlLink };
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Updates an existing event in user's Google Calendar.
 */
export async function updateGoogleCalendarEvent(
  token: string,
  calendarId: string,
  googleEventId: string,
  event: Partial<CalendarEvent>
): Promise<void> {
  try {
    const isAllDay = Boolean(event.allDay || (!event.startTime && !event.endTime));
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    let startPayload: any;
    let endPayload: any;

    if (isAllDay && event.date) {
      startPayload = { date: event.date };
      const nextDay = new Date(`${event.date}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      endPayload = { date: formatIsoDate(nextDay) };
    } else if (event.date) {
      const sTime = event.startTime || "10:00";
      const eTime = event.endTime || addOneHour(sTime);
      startPayload = { dateTime: `${event.date}T${sTime}:00`, timeZone };
      endPayload = { dateTime: `${event.date}T${eTime}:00`, timeZone };
    }

    const body: Record<string, any> = {};
    if (event.title !== undefined) body.summary = event.title;
    if (event.notes !== undefined) body.description = event.notes;
    if (event.location !== undefined) body.location = event.location;
    if (startPayload) body.start = startPayload;
    if (endPayload) body.end = endPayload;

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw await handleGoogleApiError(res);
    }
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Deletes an event from user's Google Calendar.
 */
export async function deleteGoogleCalendarEvent(
  token: string,
  calendarId: string,
  googleEventId: string
): Promise<void> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok && res.status !== 404) {
      throw await handleGoogleApiError(res);
    }
  } catch (error) {
    throw normalizeError(error);
  }
}

// ---------------- Helpers & Error Handling ---------------- //

async function handleGoogleApiError(res: Response): Promise<GoogleCalendarError> {
  let message = `Google Calendar error (${res.status})`;
  let type: GoogleCalendarError["type"] = "unknown";

  try {
    const body = await res.json();
    if (body.error?.message) {
      message = body.error.message;
    }
  } catch {
    // Ignore JSON parse errors
  }

  if (res.status === 401) {
    type = "expired";
    clearGoogleAccessToken();
    message = "Your Google Calendar authorization has expired. Please reconnect.";
  } else if (res.status === 403) {
    if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("rate")) {
      type = "quota";
      message = "Google Calendar API rate limit or quota exceeded. Please try again in a few minutes.";
    } else {
      type = "revoked";
      message = "Permission to access Google Calendar was revoked or not granted.";
    }
  } else if (res.status >= 500) {
    type = "network";
    message = "Google Calendar servers are temporarily unavailable. Please try again.";
  }

  return { type, message, status: res.status };
}

function normalizeError(error: any): GoogleCalendarError {
  if (error && typeof error === "object" && error.type && error.message) {
    return error as GoogleCalendarError;
  }
  if (!navigator.onLine) {
    return {
      type: "network",
      message: "No internet connection. Please check your network.",
    };
  }
  return {
    type: "unknown",
    message: error?.message || "An unexpected error occurred while communicating with Google Calendar.",
  };
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${date}`;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function addOneHour(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr || "10", 10) + 1;
  if (h >= 24) h = 23;
  return `${String(h).padStart(2, "0")}:${mStr || "00"}`;
}
