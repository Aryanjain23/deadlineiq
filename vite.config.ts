import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { aiService } from "./server/ai";
import { checkAccount, registerAccount, unregisterAccount } from "./server/accounts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "deadlineiq-api-endpoints",
      configureServer(server) {
        // Account check endpoint
        server.middlewares.use("/api/auth/check-account", (req, res) => {
          const url = new URL(req.url || "", "http://localhost");
          const email = url.searchParams.get("email") || "";
          if (!email) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Email query param is required." }));
            return;
          }
          const { exists, record } = checkAccount(email);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            exists,
            email: email.toLowerCase().trim(),
            displayName: record?.displayName,
            usn: record?.usn,
          }));
        });

        // Account registration endpoint
        server.middlewares.use("/api/auth/register-account", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const { email, uid, displayName, usn } = JSON.parse(body || "{}");
              if (!email) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Valid email is required." }));
                return;
              }
              const record = registerAccount({ email, uid, displayName, usn });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, email, record }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        });

        // Account unregistration endpoint
        server.middlewares.use("/api/auth/unregister-account", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const { email } = JSON.parse(body || "{}");
              if (email) unregisterAccount(email);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        });

        // AI Providers Status endpoint
        server.middlewares.use("/api/ai/status", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              success: true,
              providers: aiService.getAvailableProviders(),
            })
          );
        });

        // Unified AI Extraction API (Gemini & OpenRouter with fallback)
        server.middlewares.use("/api/extract-deadlines", async (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const result = await aiService.extractDeadlines(
                payload,
                payload?.preferredProvider
              );
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  success: true,
                  deadlines: result.data,
                  provider: result.provider,
                  model: result.model,
                })
              );
            } catch (err: any) {
              console.error("AI Extraction Error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  success: false,
                  error: aiService.sanitizeErrorMessage(err),
                })
              );
            }
          });
        });

        // Unified AI Daily Planner API (Gemini & OpenRouter with fallback)
        server.middlewares.use("/api/plan-my-day", async (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const result = await aiService.generatePlanMyDay(
                payload,
                payload?.preferredProvider
              );
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  success: true,
                  blocks: result.data,
                  provider: result.provider,
                  model: result.model,
                })
              );
            } catch (err: any) {
              console.error("AI Daily Planner Error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  success: false,
                  error: aiService.sanitizeErrorMessage(err),
                })
              );
            }
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

