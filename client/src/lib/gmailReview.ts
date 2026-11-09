/**
 * Gmail 3-Stage Sync & Review Inbox Module for DeadlineIQ
 *
 * Implements:
 * Stage 1: Smart fetching (HTML->Text, multi-category, query pre-filter, pagination, incremental sync, thread deduplication)
 * Stage 2: AI Triage & Error handling (verdict: relevant | maybe | ignore, confidence, reason, course)
 * Stage 3: Local Review Inbox management & Sender Trust/Block rules
 * Stage 4: Structured Deadline Extraction (title, due date/time, type, needsDate)
 */

import { getGmailAccessToken, requestGmailAccess, clearGmailAccessToken, getGmailMeta, saveGmailMeta } from "./gmail";

export interface SenderRules {
  trustedSenders: string[]; // Email or domain strings
  blockedSenders: string[]; // Email or domain strings
}

export interface ExtractedDeadlineDetails {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  course: string | null;
  type: "assignment" | "exam" | "quiz" | "project" | "other";
  needsDate: boolean;
  notes: string | null;
}

export interface GmailReviewItem {
  id: string;
  threadId: string;
  sender: string;
  senderEmail: string;
  subject: string;
  dateReceived: string;
  snippet: string;
  sourceLink: string;
  verdict: "relevant" | "maybe" | "ignore";
  confidence: number; // 0 to 1
  reason: string;
  course: string | null;
  status: "pending" | "added" | "dismissed";
  extracted: ExtractedDeadlineDetails;
  createdAt: string;
}

export interface GmailSyncStats {
  success: boolean;
  totalScanned: number;
  passedPreFilterCount: number;
  relevantCount: number;
  maybeCount: number;
  ignoredCount: number;
  pendingReviewCount: number;
  feedback: string;
  logs: string[];
}

/**
 * Converts HTML email content into clean, readable plain text.
 */
export function convertHtmlToPlainText(html: string): string {
  if (!html) return "";
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      // Remove scripts, styles, and hidden elements
      const elements = doc.querySelectorAll("script, style, noscript, iframe, svg");
      elements.forEach((el) => el.remove());
      const text = doc.body?.textContent || doc.body?.innerText || "";
      return text.replace(/\s+/g, " ").trim();
    }
  } catch {}

  // Fallback regex HTML stripper
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract email address from "Name <email@domain.com>" format.
 */
export function extractEmailAddress(fromHeader: string): string {
  if (!fromHeader) return "";
  const match = fromHeader.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].toLowerCase().trim();
  }
  return fromHeader.toLowerCase().trim();
}

/**
 * Storage key helpers for user-isolated data
 */
function getStorageKey(uid: string, type: string): string {
  const cleanUid = (uid || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  return `deadlineiq_gmail_${type}_${cleanUid}`;
}

/**
 * Retrieves persisted review inbox items for a given user UID.
 */
export function getReviewInbox(uid: string): GmailReviewItem[] {
  const key = getStorageKey(uid, "review_inbox");
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to read review inbox:", err);
  }
  return [];
}

/**
 * Persists review inbox items for a given user UID.
 */
export function saveReviewInbox(uid: string, items: GmailReviewItem[]): void {
  const key = getStorageKey(uid, "review_inbox");
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.warn("Failed to save review inbox:", err);
  }
}

/**
 * Retrieves sender trust & block rules for a given user UID.
 */
export function getSenderRules(uid: string): SenderRules {
  const key = getStorageKey(uid, "sender_rules");
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        trustedSenders: Array.isArray(parsed.trustedSenders) ? parsed.trustedSenders : [],
        blockedSenders: Array.isArray(parsed.blockedSenders) ? parsed.blockedSenders : [],
      };
    }
  } catch (err) {
    console.warn("Failed to read sender rules:", err);
  }
  return {
    trustedSenders: ["classroom.google.com", "instructure.com", "canvas"],
    blockedSenders: [],
  };
}

/**
 * Persists sender trust & block rules for a given user UID.
 */
export function saveSenderRules(uid: string, rules: SenderRules): void {
  const key = getStorageKey(uid, "sender_rules");
  try {
    localStorage.setItem(key, JSON.stringify(rules));
  } catch (err) {
    console.warn("Failed to save sender rules:", err);
  }
}

/**
 * Adds or removes a sender rule.
 */
export function setSenderRule(
  uid: string,
  sender: string,
  action: "trust" | "block" | "clear"
): SenderRules {
  const rules = getSenderRules(uid);
  const cleanSender = sender.toLowerCase().trim();

  // Remove existing occurrences
  rules.trustedSenders = rules.trustedSenders.filter((s) => s.toLowerCase() !== cleanSender);
  rules.blockedSenders = rules.blockedSenders.filter((s) => s.toLowerCase() !== cleanSender);

  if (action === "trust") {
    rules.trustedSenders.push(cleanSender);
  } else if (action === "block") {
    rules.blockedSenders.push(cleanSender);
  }

  saveSenderRules(uid, rules);
  return rules;
}

/**
 * Stage 1: Smart Gmail Message Fetcher
 */
export async function fetchGmailMessagesSmart(
  accessToken: string,
  lastSyncTime?: string
): Promise<{
  messages: Array<{
    id: string;
    threadId: string;
    snippet: string;
    subject: string;
    from: string;
    date: string;
    bodyText: string;
  }>;
  totalFetched: number;
  logs: string[];
}> {
  const logs: string[] = [];

  // Build incremental or 60-day backfill search query
  let dateQuery = "newer_than:60d";
  if (lastSyncTime) {
    try {
      const lastDate = new Date(lastSyncTime);
      if (!isNaN(lastDate.getTime())) {
        const yyyy = lastDate.getFullYear();
        const mm = String(lastDate.getMonth() + 1).padStart(2, "0");
        const dd = String(lastDate.getDate()).padStart(2, "0");
        dateQuery = `after:${yyyy}/${mm}/${dd}`;
      }
    } catch {}
  }

  // Pre-filter search query across ALL categories
  const searchQuery = `${dateQuery} (assignment OR due OR deadline OR exam OR quiz OR submission OR project OR "last date" OR syllabus OR classroom.google.com OR instructure.com)`;
  logs.push(`[Stage 1] Querying Gmail API: "${searchQuery}"`);

  let pageToken: string | undefined = undefined;
  let rawMessageList: Array<{ id: string; threadId: string }> = [];
  let pageCount = 0;
  const maxPages = 4; // Safety limit: max 4 pages (100 emails)

  do {
    pageCount++;
    const url = new URL("https://www.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("maxResults", "25");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) {
      if (listRes.status === 401) {
        clearGmailAccessToken();
        throw new Error("Gmail authorization expired. Please reconnect.");
      }
      const errJson = await listRes.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gmail API error HTTP ${listRes.status}`);
    }

    const listData = await listRes.json();
    if (Array.isArray(listData.messages)) {
      rawMessageList.push(...listData.messages);
    }
    pageToken = listData.nextPageToken;
  } while (pageToken && pageCount < maxPages);

  logs.push(`[Stage 1] Found ${rawMessageList.length} raw message header(s) across ${pageCount} page(s).`);

  if (rawMessageList.length === 0) {
    return { messages: [], totalFetched: 0, logs };
  }

  // Deduplicate by threadId (keep first seen per thread)
  const seenThreads = new Set<string>();
  const deduplicatedHeaders: Array<{ id: string; threadId: string }> = [];

  for (const item of rawMessageList) {
    const threadKey = item.threadId || item.id;
    if (!seenThreads.has(threadKey)) {
      seenThreads.add(threadKey);
      deduplicatedHeaders.push(item);
    }
  }

  logs.push(`[Stage 1] Deduplicated into ${deduplicatedHeaders.length} unique email thread(s).`);

  // Fetch full message payload & bodies
  const detailedMessages: Array<{
    id: string;
    threadId: string;
    snippet: string;
    subject: string;
    from: string;
    date: string;
    bodyText: string;
  }> = [];

  for (const item of deduplicatedHeaders) {
    try {
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
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

      let fullBodyHtmlOrText = "";

      // Recursive helper to extract plain text or HTML body
      const extractBodyParts = (part: any) => {
        if (!part) return;
        if (part.mimeType === "text/plain" && part.body?.data) {
          try {
            fullBodyHtmlOrText += atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/")) + "\n";
          } catch {}
        } else if (part.mimeType === "text/html" && part.body?.data) {
          try {
            const html = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
            fullBodyHtmlOrText += convertHtmlToPlainText(html) + "\n";
          } catch {}
        }

        if (Array.isArray(part.parts)) {
          part.parts.forEach(extractBodyParts);
        }
      };

      extractBodyParts(msgData.payload);

      let cleanBodyText = fullBodyHtmlOrText.trim();
      if (!cleanBodyText) {
        cleanBodyText = snippet;
      }

      detailedMessages.push({
        id: item.id,
        threadId: msgData.threadId || item.id,
        snippet,
        subject,
        from,
        date,
        bodyText: cleanBodyText.slice(0, 3000), // Cap length for AI efficiency
      });
    } catch (err) {
      console.warn("Error loading details for message", item.id, err);
    }
  }

  logs.push(`[Stage 1] Successfully loaded full content for ${detailedMessages.length} email(s).`);
  return {
    messages: detailedMessages,
    totalFetched: detailedMessages.length,
    logs,
  };
}

/**
 * Executes full 3-Stage Sync and updates the local Review Inbox.
 */
export async function syncGmailWithReviewFlow(
  userUid: string,
  forceOAuthPopup = false
): Promise<GmailSyncStats> {
  const logs: string[] = [];

  let token = getGmailAccessToken();
  if (!token || forceOAuthPopup) {
    logs.push("[Auth] Requesting Google authorization token...");
    const authRes = await requestGmailAccess(userUid);
    token = authRes.accessToken;
  }

  const meta = getGmailMeta(userUid);
  const senderRules = getSenderRules(userUid);

  // 1. Fetch emails via Stage 1
  const fetchResult = await fetchGmailMessagesSmart(token, meta.lastSyncTime);
  logs.push(...fetchResult.logs);

  const rawFetchedCount = fetchResult.totalFetched;
  if (rawFetchedCount === 0) {
    const updatedMeta = {
      ...meta,
      isConnected: true,
      lastSyncTime: new Date().toISOString(),
    };
    saveGmailMeta(userUid, updatedMeta);

    const currentInbox = getReviewInbox(userUid);
    const pendingCount = currentInbox.filter((i) => i.status === "pending").length;

    return {
      success: true,
      totalScanned: 0,
      passedPreFilterCount: 0,
      relevantCount: 0,
      maybeCount: 0,
      ignoredCount: 0,
      pendingReviewCount: pendingCount,
      feedback: "No academic work found",
      logs,
    };
  }

  // 2. Pre-filter with sender trust/block rules
  const candidateMessages: typeof fetchResult.messages = [];
  let blockedCount = 0;

  for (const m of fetchResult.messages) {
    const senderAddr = extractEmailAddress(m.from);

    // Check if sender is blocked
    const isBlocked = senderRules.blockedSenders.some(
      (b) => senderAddr.includes(b.toLowerCase()) || m.from.toLowerCase().includes(b.toLowerCase())
    );

    if (isBlocked) {
      blockedCount++;
      logs.push(`[Pre-filter] Blocked email from ${m.from} (User Blocklist).`);
      continue;
    }

    candidateMessages.push(m);
  }

  logs.push(`[Pre-filter] ${candidateMessages.length} candidate email(s) sent to AI triage (${blockedCount} blocked).`);

  // 3. Call Stage 2 & 4 Backend AI Triage Endpoint
  let triageResults: any[] = [];
  try {
    const res = await fetch("/api/gmail/triage-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: candidateMessages,
        currentDate: new Date().toISOString().split("T")[0],
        userTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        triageResults = data.results;
      }
    }
  } catch (err) {
    logs.push(`[Stage 2] API call note: ${err}`);
  }

  // Fallback if backend route didn't return results
  if (triageResults.length === 0) {
    triageResults = candidateMessages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      verdict: "maybe",
      confidence: 0.5,
      reason: "Triaged for manual student review.",
      course: null,
      extracted: {
        title: m.subject.replace(/^(Fwd:|Re:|\s)+/i, "").trim() || "Gmail Academic Task",
        dueDate: null,
        dueTime: null,
        course: null,
        type: "assignment",
        needsDate: true,
        notes: `From: ${m.from}`,
      },
    }));
  }

  // 4. Merge results into user's Review Inbox
  const existingInbox = getReviewInbox(userUid);
  const existingMap = new Map(existingInbox.map((item) => [item.id, item]));

  let relevantCount = 0;
  let maybeCount = 0;
  let ignoredCount = blockedCount;

  for (const m of candidateMessages) {
    const tr = triageResults.find((r) => r.id === m.id || r.threadId === m.threadId);
    let verdict: "relevant" | "maybe" | "ignore" = tr?.verdict || "maybe";
    let confidence = typeof tr?.confidence === "number" ? tr.confidence : 0.6;
    let reason = tr?.reason || "Evaluated by Gmail notice analysis.";
    const course = tr?.course || null;

    // Apply sender trust rule boost
    const senderAddr = extractEmailAddress(m.from);
    const isTrusted = senderRules.trustedSenders.some(
      (t) => senderAddr.includes(t.toLowerCase()) || m.from.toLowerCase().includes(t.toLowerCase())
    );

    if (isTrusted && verdict === "ignore") {
      verdict = "maybe";
      reason += " (Upgraded from ignore due to Trusted Sender rule).";
    }

    if (verdict === "relevant") relevantCount++;
    else if (verdict === "maybe") maybeCount++;
    else ignoredCount++;

    // Only store items that are relevant or maybe in the Review Inbox
    if (verdict === "ignore") {
      continue;
    }

    const sourceLink = `https://mail.google.com/mail/u/0/#inbox/${m.id}`;
    const extractedDetails: ExtractedDeadlineDetails = tr?.extracted || {
      title: m.subject.replace(/^(Fwd:|Re:|\s)+/i, "").trim() || "Academic Notice",
      dueDate: null,
      dueTime: null,
      course: course,
      type: "assignment",
      needsDate: true,
      notes: `From: ${m.from}`,
    };

    // If item already exists in inbox, update details if pending, otherwise preserve existing status
    const prevItem = existingMap.get(m.id);
    const reviewItem: GmailReviewItem = {
      id: m.id,
      threadId: m.threadId,
      sender: m.from,
      senderEmail: senderAddr,
      subject: m.subject,
      dateReceived: m.date,
      snippet: m.snippet,
      sourceLink,
      verdict,
      confidence,
      reason,
      course,
      status: prevItem ? prevItem.status : "pending",
      extracted: extractedDetails,
      createdAt: prevItem ? prevItem.createdAt : new Date().toISOString(),
    };

    existingMap.set(m.id, reviewItem);
  }

  const updatedInboxItems = Array.from(existingMap.values());
  saveReviewInbox(userUid, updatedInboxItems);

  // Update Gmail Metadata
  const processedIds = Array.from(
    new Set([...meta.processedMessageIds, ...fetchResult.messages.map((m) => m.id)])
  );
  saveGmailMeta(userUid, {
    ...meta,
    isConnected: true,
    lastSyncTime: new Date().toISOString(),
    syncedMessagesCount: updatedInboxItems.filter((i) => i.status === "added").length,
    processedMessageIds: processedIds,
  });

  const pendingCount = updatedInboxItems.filter((i) => i.status === "pending").length;
  const feedback = `Scanned ${rawFetchedCount} emails -> ${pendingCount} need your review -> ${ignoredCount} ignored.`;

  logs.push(`[Summary] ${feedback}`);
  console.log(`[DeadlineIQ Gmail Sync]`, logs);

  return {
    success: true,
    totalScanned: rawFetchedCount,
    passedPreFilterCount: candidateMessages.length,
    relevantCount,
    maybeCount,
    ignoredCount,
    pendingReviewCount: pendingCount,
    feedback,
    logs,
  };
}
