import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { extractDeadlinesWithGemini, generatePlanMyDayWithGemini } from "./gemini";
import { checkAccount, registerAccount, unregisterAccount } from "./accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "25mb" }));

  // Gemini AI Extraction API
  app.post("/api/extract-deadlines", async (req, res) => {
    try {
      const { text, file, currentDate } = req.body;
      const deadlines = await extractDeadlinesWithGemini({ text, file, currentDate });
      res.json({ success: true, deadlines });
    } catch (error: any) {
      console.error("Gemini extraction error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to extract deadlines with Gemini.",
      });
    }
  });

  // Gemini AI Daily Planner API
  app.post("/api/plan-my-day", async (req, res) => {
    try {
      const payload = req.body;
      const blocks = await generatePlanMyDayWithGemini(payload);
      res.json({ success: true, blocks });
    } catch (error: any) {
      console.error("Gemini plan-my-day error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to generate daily plan with Gemini.",
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

