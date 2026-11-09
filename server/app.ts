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
import {
  buildGoogleAuthUrl,
  exchangeGoogleCallbackCode,
  getAccessToken,
  testGoogleServiceConnection,
  revokeGoogleAccessToken,
  getGoogleSetupCheck,
  deriveRequestOrigin,
  formatGoogleOAuthError,
} from "./googleOAuthService.js";

export const app = express();

app.use(express.json({ limit: "25mb" }));

// Normalize URL for Vercel rewrites or direct serverless execution
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/_")) {
    req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
  }
  next();
});

// GET /api/health -> { ok: true }
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    service: "DeadlineIQ Backend",
    timestamp: new Date().toISOString(),
  });
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

// STEP 1 & 2: Server-Driven Google OAuth Start Route
app.get("/api/auth/google/start", async (req, res) => {
  try {
    const service = (req.query.service as string) === "gmail" ? "gmail" : "calendar";
    let uid = (req.query.uid as string) || "";
    const idToken = (req.query.token as string) || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "");

    if (idToken) {
      try {
        const adminAuth = await getAdminAuth();
        if (adminAuth) {
          const decoded = await adminAuth.verifyIdToken(idToken);
          if (decoded.uid) {
            uid = decoded.uid;
          }
        }
      } catch (authErr) {
        console.warn("[OAuth Start] ID token verification notice:", authErr);
      }
    }

    if (!uid) {
      return res.status(400).send("User UID or Firebase ID token is required to initiate authorization.");
    }

    const origin = deriveRequestOrigin(req);
    const authUrl = buildGoogleAuthUrl(origin, service, uid);
    res.redirect(authUrl);
  } catch (err: any) {
    console.error("[OAuth Start Error]", err);
    res.status(500).send(`Failed to start Google OAuth flow: ${err?.message || err}`);
  }
});

// STEP 1 & 2: Server-Driven Google OAuth Callback Route
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;
  const errorDesc = req.query.error_description as string;
  const origin = deriveRequestOrigin(req);

  let resultPayload: any;

  if (error) {
    const friendly = formatGoogleOAuthError({ error, error_description: errorDesc });
    resultPayload = {
      type: "google-auth",
      ok: false,
      service: "unknown",
      error: friendly,
      error_description: errorDesc,
      errorCode: error,
    };
  } else if (!code || !state) {
    resultPayload = {
      type: "google-auth",
      ok: false,
      service: "unknown",
      error: "Authorization code or session state is missing.",
      errorCode: "missing_params",
    };
  } else {
    const exchangeResult = await exchangeGoogleCallbackCode(code, state);
    resultPayload = {
      type: "google-auth",
      ok: exchangeResult.ok,
      service: exchangeResult.service,
      connectedEmail: exchangeResult.connectedEmail,
      error: exchangeResult.error,
      error_description: exchangeResult.error_description,
      errorCode: exchangeResult.errorCode,
    };
  }

  // Render popup auto-closer page that posts message to window.opener
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Authorization</title>
  <style>
    body {
      background: #0c101a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: #151c2d;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .status-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .success { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
    p { margin: 0 0 16px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .btn {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-icon ${resultPayload.ok ? "success" : "error"}">
      ${resultPayload.ok ? "✓" : "!"}
    </div>
    <h2>${resultPayload.ok ? "Authorization Successful" : "Authorization Notice"}</h2>
    <p>${resultPayload.ok ? "Your Google account has been connected. This window will close automatically." : (resultPayload.error || "Unable to complete authorization.")}</p>
    <button class="btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    (function() {
      const payload = ${JSON.stringify(resultPayload)};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, "*");
        }
      } catch (e) {
        console.warn("Could not post message to opener:", e);
      }
      setTimeout(function() {
        try { window.close(); } catch (e) {}
      }, 700);
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// STEP 4: Token Access Endpoint for client operations
app.get("/api/google/oauth/token", async (req, res) => {
  try {
    const uid = req.query.uid as string;
    const service = (req.query.service as string) === "gmail" ? "gmail" : "calendar";
    if (!uid) {
      return res.status(400).json({ ok: false, success: false, error: "UID parameter is required." });
    }

    const token = await getAccessToken(uid, service);
    res.json({ ok: true, success: true, accessToken: token, service });
  } catch (err: any) {
    const status = err?.code === "reconnect_required" || err?.code === "not_connected" ? 401 : 400;
    res.status(status).json({
      ok: false,
      success: false,
      error: err?.message || "Failed to retrieve access token.",
      code: err?.code || "TOKEN_ERROR",
    });
  }
});

// STEP 7: Test Connection Endpoint (Both /api/google/test and /api/google/oauth/test-connection)
const handleGoogleTestConnection = async (req: express.Request, res: express.Response) => {
  try {
    const userUid = (req.body?.userUid || req.body?.uid || req.query.uid || "").toString().trim();
    const service = (req.query.service || req.body?.service || "calendar").toString().trim();
    if (!userUid) {
      return res.status(400).json({ ok: false, success: false, message: "userUid and service are required." });
    }

    const targetService = service === "gmail" ? "gmail" : "calendar";
    const result = await testGoogleServiceConnection(userUid, targetService);
    res.json({ ok: result.success, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, success: false, message: err?.message || "Test connection failed." });
  }
};
app.post("/api/google/test", handleGoogleTestConnection);
app.post("/api/google/oauth/test-connection", handleGoogleTestConnection);

// Google Disconnect / Revoke Endpoint (Both /api/google/disconnect and /api/google/oauth/revoke)
const handleGoogleDisconnect = async (req: express.Request, res: express.Response) => {
  try {
    const userUid = (req.body?.userUid || req.body?.uid || req.query.uid || "").toString().trim();
    const service = (req.body?.service || req.query.service || "all").toString().trim();
    if (!userUid) {
      return res.status(400).json({ ok: false, error: "User UID is required." });
    }

    const result = await revokeGoogleAccessToken(userUid, service as any);
    res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("OAuth revoke error:", error);
    res.status(500).json({ ok: false, error: error?.message || "Revoke request failed." });
  }
};
app.post("/api/google/disconnect", handleGoogleDisconnect);
app.post("/api/google/oauth/revoke", handleGoogleDisconnect);

// Server OAuth Connection Status Endpoint (Both /api/google/status and /api/google/oauth/status)
const handleGoogleStatus = (req: express.Request, res: express.Response) => {
  const uid = (req.query.uid as string) || "";
  const origin = deriveRequestOrigin(req);
  const status = getGoogleSetupCheck(uid, origin);
  res.json({
    ok: true,
    gmailConnected: status.gmailConnected,
    gmailEmail: status.gmailConnected ? "Connected" : null,
    calendarConnected: status.calendarConnected,
    calendarEmail: status.calendarConnected ? "Connected" : null,
  });
};
app.get("/api/google/status", handleGoogleStatus);
app.get("/api/google/oauth/status", handleGoogleStatus);

// Google Setup Check Endpoint (Returns booleans and diagnostic details)
app.get("/api/google/oauth/setup-check", (req, res) => {
  const uid = (req.query.uid as string) || "";
  const origin = deriveRequestOrigin(req);
  const diagnostics = getGoogleSetupCheck(uid, origin);
  res.json({
    ok: true,
    success: true,
    diagnostics,
  });
});

// Backward compatibility handler for any cached client calling exchange-code
app.post("/api/google/oauth/exchange-code", async (req, res) => {
  res.status(400).json({
    ok: false,
    success: false,
    error: "Frontend has transitioned to server-driven OAuth. Please refresh the page or click Connect.",
    code: "deprecated_flow",
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

// Explicit 404 handler for any unregistered /api/* routes
app.all("/api/*", (req, res) => {
  const method = req.method;
  const path = req.originalUrl || req.url;
  res.status(404).json({
    ok: false,
    success: false,
    error: `Backend route ${path} not found (404). The server may need a restart.`,
    method,
    path,
  });
});

// Log registered routes on startup
export function logRegisteredRoutes() {
  const routes: string[] = [];
  app._router?.stack?.forEach((middleware: any) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(",").toUpperCase();
      routes.push(`${methods} ${middleware.route.path}`);
    }
  });
  if (routes.length > 0) {
    console.log(`[DeadlineIQ Server] Registered API routes (${routes.length}):\n  - ` + routes.join("\n  - "));
  }
}

setTimeout(() => logRegisteredRoutes(), 100);

