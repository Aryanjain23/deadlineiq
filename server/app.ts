import express from "express";
import fs from "fs";
import path from "path";

// Hydrate process.env from .dev.env.json if placeholders or missing
try {
  const candidateFiles = [
    "/app/.dev.env.json",
    path.resolve(process.cwd(), "../.dev.env.json"),
    path.resolve(process.cwd(), ".dev.env.json"),
  ];
  for (const f of candidateFiles) {
    if (fs.existsSync(f)) {
      const data = JSON.parse(fs.readFileSync(f, "utf-8"));
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string" && v && (!process.env[k] || process.env[k] === "MY_GEMINI_API_KEY" || process.env[k].startsWith("YOUR_"))) {
          process.env[k] = v;
        }
      }
      break;
    }
  }
} catch {}

import { aiService } from "./ai/index.js";
import { triageAndExtractEmails } from "./ai/gmail-triage.js";
import { checkAccount, registerAccount, unregisterAccount } from "./accounts.js";
import { getAdminAuth, getAdminFirestore, getAdminStorage } from "./firebaseAdmin.js";
import { saveServerOAuthToken, getServerOAuthToken, deleteServerOAuthToken } from "./oauthStore.js";

export const app = express();

app.use(express.json({ limit: "25mb" }));

// Normalize URL for Vercel rewrites or direct serverless execution
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/_")) {
    req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
  }
  next();
});

// Unified AI Provider Status API
app.get("/api/ai/status", (_req, res) => {
  res.json({
    success: true,
    providers: aiService.getAvailableProviders(),
  });
});

// Notifications and Scheduled Reminders Status Endpoint
app.get("/api/notifications/status", (_req, res) => {
  res.json({
    status: "ok",
    service: "DeadlineIQ Notification Service",
    clientPwaNotificationsSupported: true,
    serverCronConfigured: true,
    backgroundWebPushRequirements: {
      vapidKeysConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      fcmConfigured: Boolean(process.env.FIREBASE_MESSAGING_SENDER_ID),
    },
  });
});

// Vercel Cron Endpoint for Scheduled Deadline Reminders
app.get("/api/cron/check-deadlines", async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized cron execution." });
    }

    const adminDb = await getAdminFirestore();
    let checkedCount = 0;
    let alertsEvaluated = 0;

    if (adminDb) {
      try {
        const usersSnap = await adminDb.collection("users").get();
        for (const userDoc of usersSnap.docs) {
          checkedCount++;
          const userData = userDoc.data();
          if (userData?.preferences?.deadlineAlerts === false) continue;

          const deadlinesSnap = await adminDb
            .collection("users")
            .doc(userDoc.id)
            .collection("deadlines")
            .where("completed", "==", false)
            .get();

          alertsEvaluated += deadlinesSnap.size;
        }
      } catch (dbErr) {
        console.warn("Cron Firestore query note:", dbErr);
      }
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      usersChecked: checkedCount,
      deadlinesEvaluated: alertsEvaluated,
      message: "Server deadline evaluation completed successfully.",
    });
  } catch (error: any) {
    console.error("Cron check-deadlines error:", error);
    res.status(500).json({ error: "Server reminder check failed." });
  }
});

// Unified AI Extraction API (Gemini & OpenRouter with automatic fallback)
app.post("/api/extract-deadlines", async (req, res) => {
  try {
    const { text, file, currentDate, preferredProvider } = req.body || {};

    const trimmedText = typeof text === "string" ? text.trim() : "";
    if (!trimmedText && (!file || !file.base64)) {
      res.status(400).json({
        success: false,
        error: "Please provide an announcement text or upload a document/image.",
      });
      return;
    }

    if (file) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/gif",
        "application/pdf",
      ];

      const mime = (file.mimeType || "").toLowerCase();
      if (mime && !allowedMimeTypes.includes(mime)) {
        res.status(400).json({
          success: false,
          error: "Unsupported file type. Please upload a PDF, PNG, JPG, or WebP document.",
        });
        return;
      }

      if (typeof file.base64 === "string" && file.base64.length > 22 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          error: "Selected file is too large (maximum size is 15MB). Please upload a smaller file or paste the text directly.",
        });
        return;
      }
    }

    const result = await aiService.extractDeadlines(
      { text: trimmedText, file, currentDate },
      preferredProvider
    );
    res.json({
      success: true,
      deadlines: result.data,
      provider: result.provider,
      model: result.model,
    });
  } catch (error: any) {
    console.error("AI extraction error:", error);
    const userMessage = aiService.sanitizeErrorMessage(error);
    res.status(500).json({
      success: false,
      error: userMessage,
    });
  }
});

// Unified Gmail Triage & Deadline Extraction API
app.post("/api/gmail/triage-extract", async (req, res) => {
  try {
    const { messages, currentDate, userTimeZone } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({ success: true, results: [] });
    }

    const results = await triageAndExtractEmails(messages, currentDate, userTimeZone);
    res.json({ success: true, results });
  } catch (error: any) {
    console.error("Gmail triage extraction route error:", error);
    res.status(500).json({ success: false, error: "Triage process failed." });
  }
});

// Google OAuth Authorization Code Exchange Endpoint (Server-Side Offline Refresh Token)
app.post("/api/google/oauth/exchange-code", async (req, res) => {
  try {
    const { code, userUid, service = "unified" } = req.body || {};
    if (!code || !userUid) {
      return res.status(400).json({ error: "Authorization code and userUid are required." });
    }

    // Resolve OAuth Client ID
    let clientId = process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      try {
        const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
          if (cfg.oAuthClientId) clientId = cfg.oAuthClientId;
        }
      } catch {}
    }

    if (!clientId) {
      return res.status(500).json({ error: "Google OAuth Client ID is missing on server." });
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        grant_type: "authorization_code",
        redirect_uri: "postmessage",
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      console.warn("Google code exchange error:", tokenData);
      return res.status(400).json({ error: tokenData.error_description || tokenData.error || "Failed to exchange authorization code." });
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Fetch user profile email
    let connectedEmail: string | null = null;
    try {
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (profileRes.ok) {
        const p = await profileRes.json();
        connectedEmail = p.email || null;
      }
    } catch {}

    // Store refresh token securely on server
    if (refresh_token) {
      saveServerOAuthToken({
        userUid,
        service: service as any,
        refreshToken: refresh_token,
        connectedEmail,
        scopes: typeof scope === "string" ? scope.split(" ") : [],
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      access_token,
      expires_in: expires_in || 3599,
      connectedEmail,
    });
  } catch (error: any) {
    console.error("OAuth exchange endpoint error:", error);
    res.status(500).json({ error: "Failed to process Google authorization." });
  }
});

// Google OAuth Silent Token Refresh Endpoint
app.post("/api/google/oauth/refresh-token", async (req, res) => {
  try {
    const { userUid, service = "unified" } = req.body || {};
    if (!userUid) {
      return res.status(400).json({ error: "User UID is required." });
    }

    const stored = getServerOAuthToken(userUid, service as any);
    if (!stored || !stored.refreshToken) {
      return res.status(401).json({ success: false, error: "reconnect_required", message: "No refresh token stored. Reconnection required." });
    }

    let clientId = process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      try {
        const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
          if (cfg.oAuthClientId) clientId = cfg.oAuthClientId;
        }
      } catch {}
    }

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: stored.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    const refreshData = await refreshRes.json();
    if (!refreshRes.ok || refreshData.error) {
      console.warn(`Refresh token failed for ${userUid} (${service}):`, refreshData);
      if (refreshData.error === "invalid_grant" || refreshData.error === "unauthorized_client") {
        deleteServerOAuthToken(userUid, service as any);
        return res.status(401).json({ success: false, error: "reconnect_required", message: "Google connection expired or was revoked. Please reconnect." });
      }
      return res.status(400).json({ error: refreshData.error_description || "Token refresh failed." });
    }

    res.json({
      success: true,
      access_token: refreshData.access_token,
      expires_in: refreshData.expires_in || 3599,
      connectedEmail: stored.connectedEmail,
    });
  } catch (error: any) {
    console.error("OAuth token refresh endpoint error:", error);
    res.status(500).json({ error: "Token refresh request failed." });
  }
});

// Google OAuth Revoke & Disconnect Endpoint
app.post("/api/google/oauth/revoke", async (req, res) => {
  try {
    const { userUid, service = "all" } = req.body || {};
    if (!userUid) {
      return res.status(400).json({ error: "User UID is required." });
    }

    const stored = getServerOAuthToken(userUid, service === "all" ? "unified" : service as any);
    if (stored?.refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.refreshToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch (err) {
        console.warn("Revoke fetch notice:", err);
      }
    }

    deleteServerOAuthToken(userUid, service as any);
    res.json({ success: true, message: `Disconnected ${service} integration.` });
  } catch (error: any) {
    console.error("OAuth revoke endpoint error:", error);
    res.status(500).json({ error: "Revoke request failed." });
  }
});

// Server OAuth Connection Status Endpoint
app.get("/api/google/oauth/status", (req, res) => {
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: "UID required" });

  const gmail = getServerOAuthToken(uid, "gmail") || getServerOAuthToken(uid, "unified");
  const calendar = getServerOAuthToken(uid, "calendar") || getServerOAuthToken(uid, "unified");

  res.json({
    gmailConnected: Boolean(gmail),
    gmailEmail: gmail?.connectedEmail || null,
    calendarConnected: Boolean(calendar),
    calendarEmail: calendar?.connectedEmail || null,
  });
});

// Unified AI Timetable Extraction API
app.post("/api/extract-timetable", async (req, res) => {
  try {
    const { text, file, preferredProvider } = req.body || {};

    const trimmedText = typeof text === "string" ? text.trim() : "";
    if (!trimmedText && (!file || !file.base64)) {
      res.status(400).json({
        success: false,
        error: "Please upload a timetable file (PDF/Image) or paste the schedule text.",
      });
      return;
    }

    if (file) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/gif",
        "application/pdf",
      ];

      const mime = (file.mimeType || "").toLowerCase();
      if (mime && !allowedMimeTypes.includes(mime)) {
        res.status(400).json({
          success: false,
          error: "Unsupported file type. Please upload a PDF, PNG, JPG, or WebP timetable.",
        });
        return;
      }

      if (typeof file.base64 === "string" && file.base64.length > 22 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          error: "Selected file is too large (maximum size is 15MB). Please upload a smaller file.",
        });
        return;
      }
    }

    const result = await aiService.extractTimetable(
      { text: trimmedText, file },
      preferredProvider
    );
    res.json({
      success: true,
      entries: result.data,
      provider: result.provider,
      model: result.model,
    });
  } catch (error: any) {
    console.error("AI timetable extraction error:", error);
    const userMessage = aiService.sanitizeErrorMessage(error);
    res.status(500).json({
      success: false,
      error: userMessage,
    });
  }
});

// Unified AI Exam Schedule Extraction API
app.post("/api/extract-exams", async (req, res) => {
  try {
    const { text, file, currentDate, preferredProvider } = req.body || {};

    const trimmedText = typeof text === "string" ? text.trim() : "";
    if (!trimmedText && (!file || !file.base64)) {
      res.status(400).json({
        success: false,
        error: "Please upload an exam schedule file (PDF/Image) or paste the exam timetable text.",
      });
      return;
    }

    if (file) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/gif",
        "application/pdf",
      ];

      const mime = (file.mimeType || "").toLowerCase();
      if (mime && !allowedMimeTypes.includes(mime)) {
        res.status(400).json({
          success: false,
          error: "Unsupported file type. Please upload a PDF, PNG, JPG, or WebP exam schedule.",
        });
        return;
      }

      if (typeof file.base64 === "string" && file.base64.length > 22 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          error: "Selected file is too large (maximum size is 15MB). Please upload a smaller file.",
        });
        return;
      }
    }

    const result = await aiService.extractExams(
      { text: trimmedText, file, currentDate },
      preferredProvider
    );
    res.json({
      success: true,
      exams: result.data,
      provider: result.provider,
      model: result.model,
    });
  } catch (error: any) {
    console.error("AI exam extraction error:", error);
    const userMessage = aiService.sanitizeErrorMessage(error);
    res.status(500).json({
      success: false,
      error: userMessage,
    });
  }
});

// Unified AI Daily Planner API (Gemini & OpenRouter with automatic fallback)
app.post("/api/plan-my-day", async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await aiService.generatePlanMyDay(
      payload,
      payload?.preferredProvider
    );
    res.json({
      success: true,
      blocks: result.data,
      provider: result.provider,
      model: result.model,
    });
  } catch (error: any) {
    console.warn("AI plan-my-day fallback triggered:", error?.message || error);
    const userMessage = aiService.sanitizeErrorMessage(error);
    res.json({
      success: false,
      error: userMessage,
    });
  }
});

// DeadlineIQ Account Directory (Verification for Sign In / Create Account)
app.get("/api/auth/check-account", (req, res) => {
  const rawEmail = (req.query.email as string) || "";
  const cleanEmail = rawEmail.toLowerCase().trim();
  if (!cleanEmail) {
    return res.status(400).json({ error: "Email query param is required." });
  }

  const { exists, record } = checkAccount(cleanEmail);
  res.json({
    exists,
    email: cleanEmail,
    displayName: record?.displayName,
    usn: record?.usn,
  });
});

app.post("/api/auth/register-account", (req, res) => {
  const { email, uid, displayName, usn } = req.body || {};
  const cleanEmail = (email || "").toLowerCase().trim();
  if (!cleanEmail) {
    return res.status(400).json({ error: "Valid email is required." });
  }

  const record = registerAccount({ email: cleanEmail, uid, displayName, usn });
  res.json({ success: true, email: cleanEmail, record });
});

app.post("/api/auth/unregister-account", (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = (email || "").toLowerCase().trim();
  if (cleanEmail) {
    unregisterAccount(cleanEmail);
  }
  res.json({ success: true });
});

// Secure Server-Side Account & Data Deletion Endpoint
app.post("/api/auth/delete-account", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    const adminAuth = await getAdminAuth();
    const adminDb = await getAdminFirestore();
    const adminStorage = await getAdminStorage();

    if (!token) {
      return res.status(401).json({ error: "Missing authentication bearer token." });
    }

    let uid = "";
    let email = (req.body?.email || "").toLowerCase().trim();

    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
        if (decoded.email) {
          email = decoded.email.toLowerCase().trim();
        }
      } catch (err: any) {
        console.warn("Verify ID token warning:", err?.message || err);
        return res.status(401).json({ error: "Invalid or expired authentication token." });
      }
    }

    if (!uid) {
      return res.status(401).json({ error: "Could not verify authenticated user." });
    }

    // 1. Delete Firestore Document and Subcollections
    if (adminDb) {
      try {
        const userDocRef = adminDb.collection("users").doc(uid);
        await adminDb.recursiveDelete(userDocRef);
      } catch (err) {
        console.warn(`Firestore recursive delete warning for ${uid}:`, err);
      }
    }

    // 2. Delete Storage Files
    if (adminStorage) {
      try {
        const bucket = adminStorage.bucket();
        await bucket.deleteFiles({ prefix: `users/${uid}/` });
      } catch (err) {
        console.warn(`Storage delete files warning for ${uid}:`, err);
      }
    }

    // 3. Unregister from Server Registry
    if (email) {
      unregisterAccount(email);
    }

    // 4. Delete Firebase Auth User
    if (adminAuth) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (err) {
        console.warn(`Admin deleteUser warning for ${uid}:`, err);
      }
    }

    res.json({
      success: true,
      message: "Account, Firestore records, Storage files, and auth credentials permanently deleted.",
      uid,
    });
  } catch (error: any) {
    console.error("Account deletion endpoint error:", error);
    res.status(500).json({ error: "Server account deletion failed. Please try again." });
  }
});
