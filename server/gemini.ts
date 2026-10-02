import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";

export interface GeminiExtractedDeadline {
  taskName: string;
  subject: string;
  hasExplicitDate: boolean;
  explicitDueDate: string | null;
  explicitDueDayOfWeek: string | null;
  isRelativeClassMention: boolean;
  dueTime: string | null;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  geminiReasoning: string;
}

export interface ExtractRequestPayload {
  text?: string;
  file?: {
    base64: string;
    mimeType: string;
    name?: string;
  };
  currentDate?: string; // YYYY-MM-DD
}

const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

export function getGeminiApiKey(): string {
  let key = (process.env.GEMINI_API_KEY || "").trim();

  // If missing or set to the default placeholder string, look in local environment files
  if (!key || key === "MY_GEMINI_API_KEY") {
    const candidateFiles = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), ".env.development.local"),
    ];

    for (const filePath of candidateFiles) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const match = content.match(/GEMINI_API_KEY=([^\r\n]+)/);
          if (match && match[1]) {
            const candidateKey = match[1].trim();
            if (candidateKey && candidateKey !== "MY_GEMINI_API_KEY") {
              key = candidateKey;
              break;
            }
          }
        }
      } catch {}
    }
  }

  // Never return dummy placeholder as a valid API key
  if (key === "MY_GEMINI_API_KEY") {
    return "";
  }

  return key;
}

/**
 * Transforms raw Gemini SDK / Google API errors into user-actionable descriptions.
 * Distinguishes between configuration errors, authentication failures, quota exhaustion, and safety filters.
 */
export function formatGeminiError(err: any): Error {
  if (!err) return new Error("Unknown error communicating with Gemini.");

  const rawMsg = err.message || String(err);
  let parsedJson: any = null;

  try {
    if (typeof rawMsg === "string" && rawMsg.trim().startsWith("{")) {
      parsedJson = JSON.parse(rawMsg);
    }
  } catch {}

  const errorObj = parsedJson?.error || err.error || err;
  const status = errorObj?.status || err.status || "";
  const code = errorObj?.code || err.code;
  const message = (errorObj?.message || rawMsg || "").toString();

  // 1. Invalid API Key / Authentication
  if (
    message.includes("API key not valid") ||
    message.includes("API_KEY_INVALID") ||
    status === "UNAUTHENTICATED" ||
    code === 401 ||
    (code === 400 && message.toLowerCase().includes("api key"))
  ) {
    return new Error(
      "Gemini API authentication failed: The provided GEMINI_API_KEY is invalid. Please check your API key in Settings > Secrets."
    );
  }

  // 2. Rate limits or Quota exhaustion
  if (
    status === "RESOURCE_EXHAUSTED" ||
    code === 429 ||
    message.includes("quota") ||
    message.includes("Resource has been exhausted") ||
    message.includes("rate limit")
  ) {
    return new Error(
      "Gemini API rate limit or quota exceeded. Please wait a moment or verify your API quota."
    );
  }

  // 3. Safety or moderation blocks
  if (message.includes("SAFETY") || message.includes("blocked")) {
    return new Error(
      "Notice analysis was blocked by Gemini safety filters. Please verify the uploaded content."
    );
  }

  // 4. Model availability
  if (status === "NOT_FOUND" || code === 404 || message.includes("not found")) {
    return new Error(
      "The selected Gemini model is currently unavailable. Please try again in a few moments."
    );
  }

  // 5. Clean human-readable error fallback
  const cleanMsg = typeof message === "string" && message.length < 200 ? message : "Unable to process the notice with Gemini.";
  return new Error(cleanMsg);
}

export async function extractDeadlinesWithGemini(
  payload: ExtractRequestPayload
): Promise<GeminiExtractedDeadline[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured. Please configure GEMINI_API_KEY in your environment or Secrets settings."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const currentDate = payload.currentDate || new Date().toISOString().split("T")[0];

  const systemPrompt = `You are the specialized Academic Notice Deadline Extractor for DeadlineIQ.
Today's reference date is ${currentDate}.
Your goal is to accurately extract all identifiable academic assignments, lab records, tutorial problem sets, projects, homework, or exam submissions from academic notices, WhatsApp class messages, syllabus circulars, or images.

RULES:
1. Extract ALL distinct academic tasks/deadlines mentioned.
2. taskName: Descriptive, clean title (e.g., "Physics Lab Record Experiment 4", "Tutorial Sheet 3", "LTSpice Op-Amp Simulation Report").
3. subject: Identify the academic subject or course (e.g. "Physics", "Mathematics", "Electronics", "Computer Aided Design", or course code).
4. hasExplicitDate: Set to true ONLY if the notice explicitly specifies an actual calendar date (e.g., "October 15", "12/10/2026", "28th Sep") or a calendar-anchored date.
5. explicitDueDate: If hasExplicitDate is true, resolve it into format YYYY-MM-DD. If NO explicit calendar date is mentioned, return null. DO NOT INVENT OR GUESS DATES.
6. explicitDueDayOfWeek: If a specific day of the week is explicitly named (e.g. "submit on Wednesday", "due by Friday 5 PM"), return that day ("Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"|"Saturday"|"Sunday"). Otherwise null.
7. isRelativeClassMention: Set to true if the notice mentions submitting in "next class", "next lecture", "next lab session", "upcoming class", or similar relative phrases without giving a specific calendar date. Otherwise false.
8. dueTime: 24-hour time HH:mm if specified (e.g., "17:00", "23:59", "11:30"). If not specified, return null.
9. importance: Rate academic weight:
   - "CRITICAL": Final exams, major semester projects, urgent submissions.
   - "HIGH": Lab records, tests, major graded tutorial sheets.
   - "MEDIUM": Routine problem sets, homework, reading summaries.
   - "LOW": Optional readings, syllabus reviews, notes.
10. description: 1-2 sentence summary of specific instructions or requirements mentioned.
11. confidenceLevel: "HIGH" if clear and explicit, "MEDIUM" if partially ambiguous, "LOW" if inferred.
12. geminiReasoning: 1-2 concise sentences explaining what specific text/cues were identified in the source, whether dates were explicit or relative, and why this priority was assigned.`;

  const contents: any[] = [];

  // If a file was uploaded (JPG, PNG, PDF)
  if (payload.file && payload.file.base64) {
    let rawBase64 = payload.file.base64;
    // Strip data URL prefix if present
    if (rawBase64.includes(",")) {
      rawBase64 = rawBase64.split(",")[1];
    }
    contents.push({
      inlineData: {
        data: rawBase64,
        mimeType: payload.file.mimeType || "application/pdf",
      },
    });
  }

  // Text content
  let textPrompt = payload.text ? `ACADEMIC NOTICE TEXT:\n${payload.text.trim()}` : "";
  if (payload.file?.name) {
    textPrompt += `\n(Source Document Name: ${payload.file.name})`;
  }
  textPrompt += `\n\nAnalyze this academic notice thoroughly and extract all academic tasks in the requested JSON schema. If no explicit calendar date is present, do not invent one.`;

  contents.push({
    text: textPrompt,
  });

  const responseSchema = {
    type: Type.ARRAY,
    description: "List of academic deadlines extracted from the notice",
    items: {
      type: Type.OBJECT,
      properties: {
        taskName: { type: Type.STRING, description: "Descriptive name of the assignment/task" },
        subject: { type: Type.STRING, description: "Academic course/subject name" },
        hasExplicitDate: { type: Type.BOOLEAN, description: "True only if an explicit calendar date was stated" },
        explicitDueDate: { type: Type.STRING, description: "YYYY-MM-DD format if explicit date found, else null" },
        explicitDueDayOfWeek: { type: Type.STRING, description: "Day of week if named, else null" },
        isRelativeClassMention: { type: Type.BOOLEAN, description: "True if submission is specified as 'next class/lecture/lab'" },
        dueTime: { type: Type.STRING, description: "HH:mm format if specified, else null" },
        importance: { type: Type.STRING, enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
        description: { type: Type.STRING, description: "Concise summary of task requirements" },
        confidenceLevel: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
        geminiReasoning: { type: Type.STRING, description: "Explanation of cues and dates found" },
      },
      required: [
        "taskName",
        "subject",
        "hasExplicitDate",
        "isRelativeClassMention",
        "importance",
        "description",
        "confidenceLevel",
        "geminiReasoning",
      ],
    },
  };

  let lastError: Error | null = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error("Empty response received from Gemini.");
      }

      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          ...item,
          explicitDueDate: item.explicitDueDate === "null" ? null : item.explicitDueDate,
          explicitDueDayOfWeek: item.explicitDueDayOfWeek === "null" ? null : item.explicitDueDayOfWeek,
          dueTime: item.dueTime === "null" ? null : item.dueTime,
        }));
      }
      return [];
    } catch (err: any) {
      const formatted = formatGeminiError(err);
      lastError = formatted;

      // If it is an authentication/API key issue, fail fast instead of hammering other models
      if (formatted.message.includes("authentication failed")) {
        throw formatted;
      }

      console.warn(`Model ${model} extraction failed, trying next candidate:`, formatted.message);
      // Wait a tiny delay before attempting next candidate
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw lastError || new Error("Failed to extract deadlines with Gemini models.");
}

export interface PlanMyDayFixedCommitment {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: "class" | "event";
  location?: string;
  subject?: string;
}

export interface PlanMyDayActiveDeadline {
  id: string;
  taskName: string;
  subject: string;
  dueDate: string;
  dueTime?: string;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description?: string;
  isOverdue: boolean;
  isDueToday: boolean;
  isDueSoon: boolean;
}

export interface PlanMyDayPayload {
  currentDate: string; // YYYY-MM-DD
  currentTime: string; // HH:mm
  preferences: {
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    sessionLengthMinutes: number;
    breakLengthMinutes: number;
  };
  fixedCommitments: PlanMyDayFixedCommitment[];
  activeDeadlines: PlanMyDayActiveDeadline[];
}

export interface GeneratedScheduleBlock {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  type: "class" | "task" | "event" | "break";
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  deadlineId?: string;
  subject?: string;
  reason?: string;
  location?: string;
}

export async function generatePlanMyDayWithGemini(
  payload: PlanMyDayPayload
): Promise<GeneratedScheduleBlock[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured. Please configure GEMINI_API_KEY in your environment or Secrets settings."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const { currentDate, currentTime, preferences, fixedCommitments, activeDeadlines } = payload;
  const { startTime, endTime, sessionLengthMinutes, breakLengthMinutes } = preferences;

  const systemPrompt = `You are the intelligent Academic Daily Planner for DeadlineIQ.
Today's date is ${currentDate} and current local time is ${currentTime}.
Your task is to generate a realistic, structured, conflict-free daily schedule for the user between ${startTime} and ${endTime}.

CORE SAFETY & ACCURACY RULES:
1. FIXED COMMITMENTS: Classes and calendar events provided in FIXED_COMMITMENTS are immovable. Every single one that occurs between ${startTime} and ${endTime} must be present in the output with its exact startTime and endTime, type ('class' or 'event'), title, and location. DO NOT MODIFY THEIR TIMES.
2. NO FAKE DATA:
   - NEVER invent deadlines, tasks, assignments, or courses.
   - You may ONLY schedule task blocks that directly correspond to an item in ACTIVE_DEADLINES.
   - For every task block, 'deadlineId' must be set to the exact 'id' from ACTIVE_DEADLINES, 'activity' must match the taskName, and 'subject' must match the subject.
3. NO PAST SCHEDULING:
   - Do NOT schedule task blocks or new activities in the past (before current time ${currentTime}).
   - If a fixed class or event started earlier today and is already concluded, you may omit it or include it only if it overlaps today's active window.
4. STRICT PRIORITY ORDER:
   Schedule task work blocks strictly based on urgency:
   1. Overdue tasks (isOverdue == true) - highest urgency!
   2. Tasks due today (isDueToday == true)
   3. Tasks due soon in next 1-2 days (isDueSoon == true)
   4. High & Critical importance tasks
5. SESSIONS & REALISTIC BREAKS:
   - Work session length should be approx ${sessionLengthMinutes} minutes.
   - Add realistic break blocks (type 'break', ${breakLengthMinutes} mins) between focused task blocks or right after intense classes.
6. NO OVERLAPPING BLOCKS:
   - Every block must have endTime <= nextBlock.startTime.
   - Sort the output array strictly chronologically.
7. REASONING:
   - Include a crisp, insightful 'reason' for each block (e.g., "Overdue assignment — scheduled first in your morning focus window", "Fixed class from your academic timetable", "15-minute recovery break after lecture").`;

  const userPrompt = `USER REAL DATA:
CURRENT DATE: ${currentDate}
CURRENT TIME: ${currentTime}
AVAILABLE WINDOW: ${startTime} to ${endTime}
TARGET SESSION LENGTH: ${sessionLengthMinutes} minutes
BREAK DURATION: ${breakLengthMinutes} minutes

FIXED_COMMITMENTS (Immovable):
${JSON.stringify(fixedCommitments, null, 2)}

ACTIVE_DEADLINES (To be scheduled):
${JSON.stringify(activeDeadlines, null, 2)}

Generate the complete chronological schedule. If there are no active deadlines and no fixed commitments, return an empty blocks array.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      blocks: {
        type: Type.ARRAY,
        description: "Chronological, non-overlapping schedule blocks for today",
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            startTime: { type: Type.STRING, description: "HH:mm format (24-hour)" },
            endTime: { type: Type.STRING, description: "HH:mm format (24-hour)" },
            activity: { type: Type.STRING, description: "Title of the activity/class/task/break" },
            type: { type: Type.STRING, enum: ["class", "task", "event", "break"] },
            priority: { type: Type.STRING, enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
            deadlineId: { type: Type.STRING, description: "Matching deadline id if type is task, else empty string" },
            subject: { type: Type.STRING, description: "Subject or course name if applicable" },
            reason: { type: Type.STRING, description: "Short rationale for scheduling at this specific time" },
            location: { type: Type.STRING, description: "Classroom or event location if provided" },
          },
          required: ["id", "startTime", "endTime", "activity", "type"],
        },
      },
    },
    required: ["blocks"],
  };

  let lastError: Error | null = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: userPrompt }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error("Empty response received from Gemini.");
      }

      const parsed = JSON.parse(rawText);
      const blocks: GeneratedScheduleBlock[] = Array.isArray(parsed?.blocks) ? parsed.blocks : [];

      // Validate & clean up returned blocks
      return blocks.map((b, idx) => ({
        id: b.id || `block-${idx + 1}-${Date.now()}`,
        startTime: b.startTime,
        endTime: b.endTime,
        activity: b.activity || "Focus Session",
        type: (["class", "task", "event", "break"].includes(b.type) ? b.type : "task") as any,
        priority: b.priority || undefined,
        deadlineId: b.deadlineId || undefined,
        subject: b.subject || undefined,
        reason: b.reason || undefined,
        location: b.location || undefined,
      }));
    } catch (err: any) {
      const formatted = formatGeminiError(err);
      lastError = formatted;

      if (formatted.message.includes("authentication failed")) {
        throw formatted;
      }

      console.warn(`Model ${model} plan generation failed, trying next candidate:`, formatted.message);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw lastError || new Error("Failed to generate daily plan with Gemini models.");
}
