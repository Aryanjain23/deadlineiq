import type { Request, Response } from "express";

let appHandler: any = null;

async function getApp() {
  if (!appHandler) {
    const mod = await import("../server/app.js");
    appHandler = (mod as any).app || (mod as any).default || mod;
  }
  return appHandler;
}

export default async function handler(req: Request, res: Response) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel Serverless Function initialization error:", err);
    res.status(500).json({
      success: false,
      error: "Server initialization error. Please check server logs.",
    });
  }
}
