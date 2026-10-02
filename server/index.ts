import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { aiService } from "./ai";
import { checkAccount, registerAccount, unregisterAccount } from "./accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "25mb" }));

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
      const { text, file, currentDate, preferredProvider } = req.body;

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

        // Check file size (approx 15MB limit = ~20MB base64 string length)
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

  // Unified AI Daily Planner API (Gemini & OpenRouter with automatic fallback)
  app.post("/api/plan-my-day", async (req, res) => {
    try {
      const payload = req.body;
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
      console.error("AI plan-my-day error:", error);
      const userMessage = aiService.sanitizeErrorMessage(error);
      res.status(500).json({
        success: false,
        error: userMessage,
      });
    }
  });

  // ===============================================================
  // DeadlineIQ Account Directory (Verification for Sign In / Create Account)
  // Ensures only registered accounts can enter via Sign In tab,
  // and detects existing accounts on Create Account tab.
  // ===============================================================
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

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT) || 3000;

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);

