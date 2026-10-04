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
import { checkAccount, registerAccount, unregisterAccount } from "./accounts.js";
import { getAdminAuth, getAdminFirestore, getAdminStorage } from "./firebaseAdmin.js";

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
