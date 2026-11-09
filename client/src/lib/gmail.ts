/**
 * Gmail Integration Module for DeadlineIQ
 * 
 * Provides OAuth 2.0 authorization for Gmail API (gmail.readonly),
 * fetching academic emails (assignments, deadlines, exams, quizzes, submissions),
 * AI-powered extraction into structured DeadlineIQ tasks, and synchronization with Firestore.
 */

import { getGoogleOAuthClientId, ensureGoogleIdentityServices } from "./googleCalendar";
import { createDeadline } from "./services/deadlineService";
import type { Deadline, ImportanceLevel } from "./deadlines";
import { nanoid } from "nanoid";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

export interface GmailMeta {
  isConnected: boolean;
  connectedEmail?: string;
  lastSyncTime?: string;
  syncedMessagesCount: number;
  processedMessageIds: string[];
}

export interface GmailMessageItem {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  bodyText: string;
}

// In-memory token store for Gmail OAuth
let cachedGmailToken: string | null = null;
let gmailTokenExpiresAt: number = 0;

export function getGmailAccessToken(): string | null {
  if (!cachedGmailToken) return null;
  if (Date.now() >= gmailTokenExpiresAt - 60000) {
    cachedGmailToken = null;
    return null;
  }
  return cachedGmailToken;
}

export function setGmailAccessToken(token: string, expiresInSeconds: number = 3599): void {
  cachedGmailToken = token;
  gmailTokenExpiresAt = Date.now() + Math.max(300, expiresInSeconds) * 1000;
}

export function clearGmailAccessToken(): void {
  cachedGmailToken = null;
  gmailTokenExpiresAt = 0;
}

export function getGmailMeta(uid: string): GmailMeta {
  const cleanUid = (uid || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  const key = `deadlineiq_gmail_meta_${cleanUid}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isConnected: Boolean(parsed.isConnected),
        connectedEmail: parsed.connectedEmail || undefined,
        lastSyncTime: parsed.lastSyncTime || undefined,
        syncedMessagesCount: typeof parsed.syncedMessagesCount === "number" ? parsed.syncedMessagesCount : 0,
        processedMessageIds: Array.isArray(parsed.processedMessageIds) ? parsed.processedMessageIds : [],
      };
    }
  } catch (err) {
    console.warn("Failed to load Gmail metadata:", err);
  }
  return {
    isConnected: false,
    syncedMessagesCount: 0,
    processedMessageIds: [],
  };
}

export function saveGmailMeta(uid: string, meta: GmailMeta): void {
  const cleanUid = (uid || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  const key = `deadlineiq_gmail_meta_${cleanUid}`;
  try {
    localStorage.setItem(key, JSON.stringify(meta));
  } catch (err) {
    console.warn("Failed to save Gmail metadata:", err);
  }
}

/**
 * Initiates the Google Identity Services popup for unified Gmail and Calendar access.
 */
export async function requestGmailAccess(userUid = "default"): Promise<{ accessToken: string; expiresIn: number }> {
  const { requestUnifiedGoogleAccess } = await import("./googleAuth");
  const result = await requestUnifiedGoogleAccess(userUid);
  return {
    accessToken: result.accessToken,
    expiresIn: 3599,
  };
}

/**
 * Fetches current user's Gmail address profile.
 */
export async function fetchGmailUserProfile(accessToken: string): Promise<string> {
  try {
    const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.emailAddress || "";
    }
  } catch (err) {
    console.warn("Failed to fetch Gmail profile:", err);
  }
  return "";
}

/**
 * Fetches recent academic emails matching keywords from Gmail.
 */
export async function fetchAcademicGmailMessages(
  accessToken: string,
  maxResults = 10
): Promise<GmailMessageItem[]> {
  const query = 'assignment OR deadline OR exam OR quiz OR homework OR project OR submission OR "due date"';
  const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    if (listRes.status === 401) {
      clearGmailAccessToken();
      throw new Error("Gmail authorization expired. Please reconnect.");
    }
    const errJson = await listRes.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Gmail API returned HTTP ${listRes.status}`);
  }

  const listData = await listRes.json();
  const messagesList = Array.isArray(listData.messages) ? listData.messages : [];
  if (messagesList.length === 0) {
    return [];
  }

  const results: GmailMessageItem[] = [];

  for (const item of messagesList) {
    try {
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const snippet = msgData.snippet || "";
      const headers = Array.isArray(msgData.payload?.headers) ? msgData.payload.headers : [];

      const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === "subject");
      const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === "from");
      const dateHeader = headers.find((h: any) => h.name?.toLowerCase() === "date");

      const subject = subjectHeader?.value || "Academic Notice";
      const from = fromHeader?.value || "";
      const date = dateHeader?.value || new Date().toISOString();

      let bodyText = snippet;
      // Try to extract plain text body if available
      if (msgData.payload?.parts) {
        const textPart = msgData.payload.parts.find((p: any) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          try {
            bodyText = atob(textPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          } catch {}
        }
      }

      results.push({
        id: item.id,
        threadId: msgData.threadId || item.id,
        snippet,
        subject,
        from,
        date,
        bodyText: bodyText.slice(0, 1500), // Limit payload length
      });
    } catch (msgErr) {
      console.warn("Failed to fetch message details for", item.id, msgErr);
    }
  }

  return results;
}

/**
 * Extracts tasks from a set of Gmail messages using AI server endpoint or fallback parsing.
 */
async function extractTasksFromGmailMessages(
  messages: GmailMessageItem[]
): Promise<Deadline[]> {
  if (messages.length === 0) return [];

  const combinedText = messages
    .map(
      (m, idx) =>
        `--- EMAIL #${idx + 1} ---\nSubject: ${m.subject}\nSender: ${m.from}\nDate: ${m.date}\nContent: ${m.bodyText}`
    )
    .join("\n\n");

  const currentDate = new Date().toISOString().split("T")[0];

  try {
    const res = await fetch("/api/extract-deadlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: combinedText,
        currentDate,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.deadlines) && data.deadlines.length > 0) {
        return data.deadlines.map((d: any, index: number) => {
          const matchedMsg = messages[index % messages.length];
          return {
            id: `gmail_${matchedMsg?.id || "msg"}_${nanoid(6)}`,
            taskName: d.taskName || d.subject || "Gmail Task",
            subject: d.subject || "General Academic",
            description: d.description || `Extracted from email: "${matchedMsg?.subject || 'Gmail'}"`,
            dueDate: d.dueDate || currentDate,
            dueTime: d.dueTime || "23:59",
            importance: (d.importance as ImportanceLevel) || "HIGH",
            completed: false,
            createdAt: new Date().toISOString(),
            source: "ai" as const,
            sourceType: "imported" as const,
            sourceId: matchedMsg?.id,
            dateSource: "ai-extracted" as const,
            confidence: d.confidence || "HIGH",
          };
        });
      }
    }
  } catch (err) {
    console.warn("AI extraction endpoint call failed for Gmail sync:", err);
  }

  // Fallback: Convert emails directly into tasks if AI extraction didn't return items
  return messages.map((m) => {
    // Attempt simple date detection in email snippet
    let dueDate = currentDate;
    const dateMatch = m.bodyText.match(/\b(202[6-9])[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/);
    if (dateMatch) {
      dueDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }

    return {
      id: `gmail_${m.id}_${nanoid(6)}`,
      taskName: m.subject.replace(/^(Fwd:|Re:|\s)+/i, "").trim() || "Gmail Academic Task",
      subject: "Gmail Inbox",
      description: `From: ${m.from}\nSnippet: ${m.snippet}`,
      dueDate,
      dueTime: "23:59",
      importance: "HIGH" as ImportanceLevel,
      completed: false,
      createdAt: new Date().toISOString(),
      source: "ai" as const,
      sourceType: "imported" as const,
      sourceId: m.id,
      dateSource: "user-entered" as const,
      confidence: "MEDIUM" as const,
    };
  });
}

/**
 * Complete end-to-end Gmail synchronization routine.
 */
export async function syncGmailTasks(
  userUid: string,
  forceOAuthPopup = false
): Promise<{
  success: boolean;
  count: number;
  newDeadlines: Deadline[];
  connectedEmail: string;
  feedback?: string;
}> {
  const { syncGmailWithReviewFlow } = await import("./gmailReview");
  const stats = await syncGmailWithReviewFlow(userUid, forceOAuthPopup);

  const token = getGmailAccessToken();
  const meta = getGmailMeta(userUid);
  const connectedEmail = token ? (await fetchGmailUserProfile(token)) || meta.connectedEmail || "Primary Gmail" : meta.connectedEmail || "Primary Gmail";

  return {
    success: stats.success,
    count: stats.pendingReviewCount,
    newDeadlines: [],
    connectedEmail,
    feedback: stats.feedback,
  };
}

/**
 * Disconnects Gmail integration and clears stored tokens / metadata.
 * Revokes Google token and deletes server refresh token without removing deadlines.
 */
export async function disconnectGmail(uid: string): Promise<void> {
  const { disconnectUnifiedGoogleAccess } = await import("./googleAuth");
  await disconnectUnifiedGoogleAccess(uid, "gmail");
}
