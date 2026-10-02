import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import {
  AIProviderAdapter,
  AIResult,
  ExtractRequestPayload,
  ExtractedDeadline,
  PlanMyDayPayload,
  GeneratedScheduleBlock,
  AIError,
} from "./types";
import {
  safeParseJson,
  validateExtractedDeadlines,
  validateScheduleBlocks,
} from "./validator";

const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

export function getGeminiApiKey(): string {
  let key = (process.env.GEMINI_API_KEY || "").trim();

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

  if (key === "MY_GEMINI_API_KEY") {
    return "";
  }

  return key;
}

export function formatGeminiError(err: any): AIError {
  if (err instanceof AIError) return err;

  const rawMsg = err?.message || String(err || "");
  let parsedJson: any = null;

  try {
    if (typeof rawMsg === "string" && rawMsg.trim().startsWith("{")) {
      parsedJson = JSON.parse(rawMsg);
    }
  } catch {}

  const errorObj = parsedJson?.error || err?.error || err;
  const status = errorObj?.status || err?.status || "";
  const code = errorObj?.code || err?.code;
  const message = (errorObj?.message || rawMsg || "").toString();

  // Authentication error
  if (
    message.includes("API key not valid") ||
    message.includes("API_KEY_INVALID") ||
    status === "UNAUTHENTICATED" ||
    code === 401 ||
    (code === 400 && message.toLowerCase().includes("api key"))
  ) {
    return new AIError({
      message: "Gemini API authentication failed: The provided GEMINI_API_KEY is invalid.",
      code: "AUTHENTICATION_FAILED",
      provider: "gemini",
      status: 401,
      isRetryable: false,
      cause: err,
    });
  }

  // Rate limit or quota
  if (
    status === "RESOURCE_EXHAUSTED" ||
    code === 429 ||
    message.includes("quota") ||
    message.includes("Resource has been exhausted") ||
    message.includes("rate limit")
  ) {
    return new AIError({
      message: "Gemini API rate limit or quota exceeded.",
      code: "RATE_LIMIT",
      provider: "gemini",
      status: 429,
      isRetryable: true,
      cause: err,
    });
  }

  // Timeout
  if (
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("timed out") ||
    code === 504 ||
    status === "DEADLINE_EXCEEDED"
  ) {
    return new AIError({
      message: "Gemini API request timed out.",
      code: "TIMEOUT",
      provider: "gemini",
      status: 504,
      isRetryable: true,
      cause: err,
    });
  }

  // Unavailable or not found
  if (
    status === "NOT_FOUND" ||
    status === "UNAVAILABLE" ||
    code === 503 ||
    code === 404 ||
    message.includes("not found")
  ) {
    return new AIError({
      message: "Gemini service or model is temporarily unavailable.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
      status: typeof code === "number" ? code : 503,
      isRetryable: true,
      cause: err,
    });
  }

  return new AIError({
    message: message.length < 200 ? message : "Error communicating with Gemini service.",
    code: "UNKNOWN",
    provider: "gemini",
    isRetryable: true,
    cause: err,
  });
}

export class GeminiProviderAdapter implements AIProviderAdapter {
  public readonly name = "gemini" as const;

  public isAvailable(): boolean {
    return Boolean(getGeminiApiKey());
  }

  public async extractDeadlines(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedDeadline[]>> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new AIError({
        message: "GEMINI_API_KEY environment variable is not configured.",
        code: "MISSING_API_KEY",
        provider: "gemini",
        isRetryable: false,
      });
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

    // If file was uploaded (PDF, PNG, JPG, WebP)
    if (payload.file && payload.file.base64) {
      let rawBase64 = payload.file.base64;
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

    let textPrompt = payload.text ? `ACADEMIC NOTICE TEXT:\n${payload.text.trim()}` : "";
    if (payload.file?.name) {
      textPrompt += `\n(Source Document Name: ${payload.file.name})`;
    }
    textPrompt += `\n\nAnalyze this academic notice thoroughly and extract all academic tasks in the requested JSON schema. If no explicit calendar date is present, do not invent one.`;

    contents.push({ text: textPrompt });

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
          sourceType: { type: Type.STRING, enum: ["SYLLABUS", "CANVAS", "EMAIL", "ASSIGNMENT", "CLASS_NOTICE", "OTHER"] },
          isDateAmbiguous: { type: Type.BOOLEAN, description: "True if the deadline date is missing or ambiguous" },
          ambiguityNote: { type: Type.STRING, description: "Explanation if date is ambiguous or missing, else null" },
          notes: { type: Type.STRING, description: "Any special instructions or submission notes" },
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

    let lastError: AIError | null = null;

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

        const rawText = response.text?.trim() || "";
        const parsed = safeParseJson(rawText);
        const validated = validateExtractedDeadlines(parsed);

        return {
          data: validated,
          provider: "gemini",
          model,
        };
      } catch (err: any) {
        const formatted = formatGeminiError(err);
        lastError = formatted;

        if (formatted.code === "AUTHENTICATION_FAILED") {
          throw formatted;
        }

        console.warn(`Gemini model ${model} extraction failed:`, formatted.message);
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    throw lastError || new AIError({
      message: "All Gemini candidate models failed to extract deadlines.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
    });
  }

  public async generatePlanMyDay(
    payload: PlanMyDayPayload
  ): Promise<AIResult<GeneratedScheduleBlock[]>> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new AIError({
        message: "GEMINI_API_KEY environment variable is not configured.",
        code: "MISSING_API_KEY",
        provider: "gemini",
        isRetryable: false,
      });
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

    let lastError: AIError | null = null;

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

        const rawText = response.text?.trim() || "";
        const parsed = safeParseJson(rawText);
        const validated = validateScheduleBlocks(parsed);

        return {
          data: validated,
          provider: "gemini",
          model,
        };
      } catch (err: any) {
        const formatted = formatGeminiError(err);
        lastError = formatted;

        if (formatted.code === "AUTHENTICATION_FAILED") {
          throw formatted;
        }

        console.warn(`Gemini model ${model} plan generation failed:`, formatted.message);
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    throw lastError || new AIError({
      message: "All Gemini candidate models failed to generate daily plan.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
    });
  }
}
