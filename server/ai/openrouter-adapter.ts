import fs from "fs";
import path from "path";
import {
  AIProviderAdapter,
  AIResult,
  ExtractRequestPayload,
  ExtractedDeadline,
  ExtractedTimetableEntry,
  ExtractedExamEntry,
  PlanMyDayPayload,
  GeneratedScheduleBlock,
  AIError,
} from "./types";
import {
  safeParseJson,
  validateExtractedDeadlines,
  validateExtractedTimetable,
  validateExtractedExams,
  validateScheduleBlocks,
} from "./validator";
import { extractTextFromPdf, cleanPdfText } from "./pdf-parser";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Active, high-availability text models on OpenRouter with broad free and standard tier coverage
const OPENROUTER_TEXT_MODELS = [
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-small-24b-instruct-2501",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-72b-instruct",
  "openrouter/free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-24b-instruct-2501:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

// Vision-capable models on OpenRouter
const OPENROUTER_VISION_MODELS = [
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.2-11b-vision-instruct",
  "openrouter/free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
];

const REQUEST_TIMEOUT_MS = 15000;

export function getOpenRouterApiKey(): string {
  let key = (process.env.OPENROUTER_API_KEY || "").trim();

  if (!key) {
    const candidateFiles = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), ".env.development.local"),
    ];

    for (const filePath of candidateFiles) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const match = content.match(/OPENROUTER_API_KEY=([^\r\n]+)/);
          if (match && match[1]) {
            const candidateKey = match[1].trim();
            if (candidateKey) {
              key = candidateKey;
              break;
            }
          }
        }
      } catch {}
    }
  }

  // Fallback: if GEMINI_API_KEY is non-Google key (e.g. sk-or-...), treat as OpenRouter key
  if (!key) {
    const rawGemini = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (rawGemini && !rawGemini.startsWith("AIza") && rawGemini !== "MY_GEMINI_API_KEY") {
      key = rawGemini;
    }
  }

  return key;
}

export function formatOpenRouterError(err: any, status?: number): AIError {
  if (err instanceof AIError) return err;

  const rawMsg = err?.message || String(err || "");
  const statusCode = status || err?.status || err?.statusCode;
  const lowerMsg = rawMsg.toLowerCase();

  // Authentication error
  if (
    statusCode === 401 ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("api key") ||
    lowerMsg.includes("invalid credentials")
  ) {
    return new AIError({
      message: "OpenRouter authentication failed: The provided OPENROUTER_API_KEY is invalid.",
      code: "AUTHENTICATION_FAILED",
      provider: "openrouter",
      status: 401,
      isRetryable: false,
      cause: err,
    });
  }

  // Rate limit
  if (
    statusCode === 429 ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("quota") ||
    lowerMsg.includes("too many requests")
  ) {
    return new AIError({
      message: "OpenRouter rate limit reached on model. Switching to fallback model...",
      code: "RATE_LIMIT",
      provider: "openrouter",
      status: 429,
      isRetryable: true,
      cause: err,
    });
  }

  // Timeout
  if (
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("abort") ||
    statusCode === 504 ||
    statusCode === 408
  ) {
    return new AIError({
      message: "OpenRouter request timed out.",
      code: "TIMEOUT",
      provider: "openrouter",
      status: 504,
      isRetryable: true,
      cause: err,
    });
  }

  // Model unavailable or overloaded
  if (
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 404 ||
    lowerMsg.includes("busy") ||
    lowerMsg.includes("no endpoints found") ||
    lowerMsg.includes("temporarily unavailable") ||
    lowerMsg.includes("overloaded")
  ) {
    return new AIError({
      message: "OpenRouter model is temporarily busy. Switching to fallback model...",
      code: "PROVIDER_UNAVAILABLE",
      provider: "openrouter",
      status: statusCode || 503,
      isRetryable: true,
      cause: err,
    });
  }

  if (
    lowerMsg.includes("json") ||
    lowerMsg.includes("syntaxerror") ||
    lowerMsg.includes("unexpected end") ||
    lowerMsg.includes("malformed")
  ) {
    return new AIError({
      message: "OpenRouter model returned malformed output.",
      code: "MALFORMED_OUTPUT",
      provider: "openrouter",
      isRetryable: true,
      cause: err,
    });
  }

  return new AIError({
    message: rawMsg.length < 200 ? rawMsg : "Error communicating with OpenRouter service.",
    code: "UNKNOWN",
    provider: "openrouter",
    isRetryable: true,
    cause: err,
  });
}

export class OpenRouterProviderAdapter implements AIProviderAdapter {
  public readonly name = "openrouter" as const;

  public isAvailable(): boolean {
    return Boolean(getOpenRouterApiKey());
  }

  private async callOpenRouterWithFallback(
    messages: Array<{ role: string; content: any }>,
    candidateModels: string[],
    schemaInstruction: string
  ): Promise<{ text: string; model: string }> {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new AIError({
        message: "OPENROUTER_API_KEY environment variable is not configured.",
        code: "MISSING_API_KEY",
        provider: "openrouter",
        isRetryable: false,
      });
    }

    let lastError: AIError | null = null;

    for (const model of candidateModels) {
      // Try first with standard payload, and retry without response_format if provider rejects json_object parameter
      const payloadsToTry: any[] = [
        {
          model,
          messages,
          temperature: 0.2,
          max_tokens: 3000,
        },
      ];

      // Add response_format option as secondary or primary
      if (model.includes("gemini") || model.includes("qwen") || model.includes("mistral")) {
        payloadsToTry.unshift({
          ...payloadsToTry[0],
          response_format: { type: "json_object" },
        });
      }

      for (const bodyPayload of payloadsToTry) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(OPENROUTER_ENDPOINT, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "https://deadlineiq.internal",
              "X-Title": "DeadlineIQ",
            },
            body: JSON.stringify(bodyPayload),
          });

          clearTimeout(timer);

          if (!response.ok) {
            const errText = await response.text();
            let parsedError: any = null;
            try {
              parsedError = JSON.parse(errText);
            } catch {}

            const errorMsg =
              parsedError?.error?.message ||
              parsedError?.message ||
              `OpenRouter HTTP ${response.status}: ${errText.slice(0, 150)}`;

            // If response_format caused an issue (HTTP 400 or 422), continue to next payload attempt without response_format
            if ((response.status === 400 || response.status === 422) && bodyPayload.response_format) {
              console.warn(`[OpenRouter] Model ${model} rejected response_format, retrying without json_object mode...`);
              continue;
            }

            throw formatOpenRouterError(new Error(errorMsg), response.status);
          }

          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;

          if (!content || typeof content !== "string" || !content.trim()) {
            throw new AIError({
              message: "OpenRouter returned an empty response.",
              code: "MALFORMED_OUTPUT",
              provider: "openrouter",
              isRetryable: true,
            });
          }

          return { text: content.trim(), model };
        } catch (err: any) {
          clearTimeout(timer);
          const formatted = formatOpenRouterError(err);
          lastError = formatted;

          if (formatted.code === "AUTHENTICATION_FAILED") {
            throw formatted;
          }

          // If we have another payload variation (e.g. without response_format), try that before moving to next model
          if (bodyPayload.response_format && (formatted.status === 400 || formatted.status === 422)) {
            continue;
          }

          console.log(`[OpenRouter] Model ${model} unavailable, trying next candidate:`, formatted.message);
          break; // Move to next model candidate
        }
      }
    }

    throw lastError || new AIError({
      message: "All OpenRouter models failed to respond.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "openrouter",
    });
  }

  public async extractDeadlines(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedDeadline[]>> {
    const currentDate = payload.currentDate || new Date().toISOString().split("T")[0];

    const systemPrompt = `You are the specialized Academic Notice Deadline Extractor for DeadlineIQ.
Today's reference date is ${currentDate}.
Your task is to extract all academic assignments, lab records, projects, homework, and exam submissions.

Output MUST be a strictly valid JSON object with the following structure:
{
  "deadlines": [
    {
      "taskName": "string",
      "subject": "string",
      "hasExplicitDate": boolean,
      "explicitDueDate": "YYYY-MM-DD or null",
      "explicitDueDayOfWeek": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday or null",
      "isRelativeClassMention": boolean,
      "dueTime": "HH:mm or null",
      "importance": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "description": "string",
      "confidenceLevel": "HIGH" | "MEDIUM" | "LOW",
      "geminiReasoning": "string"
    }
  ]
}`;

    let extractedPdfText = "";
    let isTextBasedPdf = false;
    let hasVisionInput = false;
    let userMessageContent: any;

    if (payload.file && payload.file.base64) {
      let rawBase64 = payload.file.base64;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }
      const mime = (payload.file.mimeType || "application/pdf").toLowerCase();

      if (mime === "application/pdf") {
        extractedPdfText = await extractTextFromPdf(rawBase64);
        if (extractedPdfText && extractedPdfText.trim().length >= 25) {
          isTextBasedPdf = true;
        }
      }

      if (!isTextBasedPdf && mime.startsWith("image/")) {
        hasVisionInput = true;
        userMessageContent = [
          {
            type: "text",
            text: `Analyze this image notice for academic deadlines.\n${payload.text || ""}`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${rawBase64}`,
            },
          },
        ];
      }
    }

    if (!userMessageContent) {
      let textBody = payload.text ? `NOTICE TEXT:\n${payload.text.trim()}\n\n` : "";
      if (extractedPdfText) {
        textBody += `EXTRACTED DOCUMENT TEXT:\n${extractedPdfText.slice(0, 8000)}\n\n`;
      }
      if (payload.file?.name) {
        textBody += `Source File: ${payload.file.name}\n\n`;
      }
      textBody += "Extract all academic deadlines into the required JSON object format.";
      userMessageContent = textBody;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessageContent },
    ];

    const models = hasVisionInput ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
    const { text, model } = await this.callOpenRouterWithFallback(messages, models, "deadlines");

    const parsed = safeParseJson(text);
    const validated = validateExtractedDeadlines(parsed);

    return {
      data: validated,
      provider: "openrouter",
      model,
    };
  }

  public async generatePlanMyDay(
    payload: PlanMyDayPayload
  ): Promise<AIResult<GeneratedScheduleBlock[]>> {
    const {
      currentDate,
      currentTime,
      preferences,
      fixedCommitments,
      activeDeadlines,
      upcomingExams = [],
      completedTasks = [],
      userSubjects = [],
    } = payload;
    const { startTime, endTime, sessionLengthMinutes, breakLengthMinutes } = preferences;

    const systemPrompt = `You are the context-aware Academic Daily Planner for DeadlineIQ.
Today's date: ${currentDate}, Current time: ${currentTime}.
Target window: ${startTime} to ${endTime}.

Output MUST be a strictly valid JSON object with the following structure:
{
  "blocks": [
    {
      "id": "string",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "activity": "string",
      "type": "class" | "task" | "event" | "break" | "revision" | "skill" | "review" | "organize",
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "deadlineId": "matching deadline id or empty string",
      "subject": "string",
      "reason": "string",
      "location": "string",
      "isAiRecommendation": boolean
    }
  ]
}

PRIORITY RULES:
1. FIXED COMMITMENTS: Classes, today's exams, and events must be present in their exact time slots.
2. ACTIVE DEADLINES: Schedule priority study blocks for pending assignments, especially overdue/due-soon items. Reason should be short (e.g. "Due tomorrow", "Due in 3 days").
3. UPCOMING EXAM REVISION: If user has upcoming exams (in UPCOMING_EXAMS), allocate revision blocks (type: 'revision', reason: "Exam in X days").
4. INTELLIGENT FREE-TIME PLANNING: Suggest meaningful course review, practical skill practice, academic organization, or restorative breaks.
5. GROUNDING: Ground suggestions in user courses/subjects when available.

CORE CONSTRAINTS:
- Keep reasons short and useful (e.g. "Due tomorrow", "Exam in 4 days", "Course review").
- Set 'isAiRecommendation: true' for AI suggestions (revision, review, skill, organize) and 'false' for fixed commitments and deadline tasks.
- Keep realistic breaks (type: 'break', ~${breakLengthMinutes} mins).
- No overlapping blocks. Sort chronologically.`;

    const userPrompt = `USER ACADEMIC CONTEXT:
CURRENT DATE: ${currentDate}
CURRENT TIME: ${currentTime}
AVAILABLE WINDOW: ${startTime} to ${endTime}
TARGET SESSION LENGTH: ${sessionLengthMinutes} mins
BREAK DURATION: ${breakLengthMinutes} mins

FIXED_COMMITMENTS:
${JSON.stringify(fixedCommitments, null, 2)}

ACTIVE_DEADLINES:
${JSON.stringify(activeDeadlines, null, 2)}

UPCOMING_EXAMS:
${JSON.stringify(upcomingExams, null, 2)}

RECENTLY_COMPLETED_TASKS:
${JSON.stringify(completedTasks, null, 2)}

ENROLLED_COURSES:
${JSON.stringify(userSubjects, null, 2)}

Generate the complete context-aware daily plan. Return ONLY the JSON object.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const { text, model } = await this.callOpenRouterWithFallback(
      messages,
      OPENROUTER_TEXT_MODELS,
      "blocks"
    );

    const parsed = safeParseJson(text);
    const validated = validateScheduleBlocks(parsed);

    return {
      data: validated,
      provider: "openrouter",
      model,
    };
  }

  public async extractTimetable(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedTimetableEntry[]>> {
    const systemPrompt = `You are the specialized Weekly Class Timetable Extractor for DeadlineIQ.
Extract all scheduled recurring lectures, practicals, labs, and tutorials from the timetable.

Output MUST be a strictly valid JSON object with the following structure:
{
  "entries": [
    {
      "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "subject": "string",
      "subjectCode": "string or null",
      "faculty": "string or null",
      "room": "string or null",
      "section": "string or null",
      "confidenceLevel": "HIGH" | "MEDIUM" | "LOW",
      "isUncertain": boolean
    }
  ]
}

RULES:
1. Extract every recurring class slot. 24-hour time format HH:mm.
2. Ignore empty slots, lunch breaks, and intervals.
3. Do NOT invent subjects or times not in the document.`;

    let extractedPdfText = "";
    let isTextBasedPdf = false;
    let hasVisionInput = false;
    let userMessageContent: any;

    if (payload.file && payload.file.base64) {
      let rawBase64 = payload.file.base64;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }
      const mime = (payload.file.mimeType || "application/pdf").toLowerCase();

      if (mime === "application/pdf") {
        extractedPdfText = await extractTextFromPdf(rawBase64);
        if (extractedPdfText && extractedPdfText.trim().length >= 25) {
          isTextBasedPdf = true;
        }
      }

      if (!isTextBasedPdf && mime.startsWith("image/")) {
        hasVisionInput = true;
        userMessageContent = [
          {
            type: "text",
            text: `Extract the weekly class timetable from this schedule image.\n${payload.text || ""}`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${rawBase64}`,
            },
          },
        ];
      }
    }

    if (!userMessageContent) {
      let textBody = payload.text ? `TIMETABLE TEXT:\n${payload.text.trim()}\n\n` : "";
      if (extractedPdfText) {
        textBody += `EXTRACTED DOCUMENT TEXT LAYER:\n${extractedPdfText.slice(0, 8000)}\n\n`;
      }
      if (payload.file?.name) {
        textBody += `Source File: ${payload.file.name}\n\n`;
      }
      textBody += "Extract all weekly recurring class schedule entries into the required JSON format.";
      userMessageContent = textBody;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessageContent },
    ];

    const models = hasVisionInput ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
    const { text, model } = await this.callOpenRouterWithFallback(messages, models, "entries");

    const parsed = safeParseJson(text);
    const validated = validateExtractedTimetable(parsed);

    return {
      data: validated,
      provider: "openrouter",
      model,
    };
  }

  public async extractExams(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedExamEntry[]>> {
    const currentDate = payload.currentDate || new Date().toISOString().split("T")[0];

    const systemPrompt = `You are the specialized Examination Schedule Extractor for DeadlineIQ.
Today's reference date is ${currentDate}.
Extract all scheduled exams, midterms, finals (SEE), internal tests (CIE/IA), practicals, and quizzes.

Output MUST be a strictly valid JSON object with the following structure:
{
  "exams": [
    {
      "subject": "string",
      "subjectCode": "string or null",
      "examDate": "YYYY-MM-DD or null",
      "startTime": "HH:mm or null",
      "endTime": "HH:mm or null",
      "examType": "SEE" | "Internal" | "Lab" | "Quiz" | "Practical" | "Other",
      "room": "string or null",
      "semesterBranch": "string or null",
      "confidenceLevel": "HIGH" | "MEDIUM" | "LOW",
      "isDateAmbiguous": boolean,
      "ambiguityNote": "string or null"
    }
  ]
}

RULES:
1. Resolve calendar dates into YYYY-MM-DD. Never invent dates.
2. 24-hour time HH:mm format.`;

    let extractedPdfText = "";
    let isTextBasedPdf = false;
    let hasVisionInput = false;
    let userMessageContent: any;

    if (payload.file && payload.file.base64) {
      let rawBase64 = payload.file.base64;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }
      const mime = (payload.file.mimeType || "application/pdf").toLowerCase();

      if (mime === "application/pdf") {
        extractedPdfText = await extractTextFromPdf(rawBase64);
        if (extractedPdfText && extractedPdfText.trim().length >= 25) {
          isTextBasedPdf = true;
        }
      }

      if (!isTextBasedPdf && mime.startsWith("image/")) {
        hasVisionInput = true;
        userMessageContent = [
          {
            type: "text",
            text: `Extract all scheduled exams from this date sheet image.\n${payload.text || ""}`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${rawBase64}`,
            },
          },
        ];
      }
    }

    if (!userMessageContent) {
      let textBody = payload.text ? `EXAM SCHEDULE TEXT:\n${payload.text.trim()}\n\n` : "";
      if (extractedPdfText) {
        textBody += `EXTRACTED DOCUMENT TEXT LAYER:\n${extractedPdfText.slice(0, 8000)}\n\n`;
      }
      if (payload.file?.name) {
        textBody += `Source File: ${payload.file.name}\n\n`;
      }
      textBody += "Extract all examination dates and times into the required JSON format.";
      userMessageContent = textBody;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessageContent },
    ];

    const models = hasVisionInput ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
    const { text, model } = await this.callOpenRouterWithFallback(messages, models, "exams");

    const parsed = safeParseJson(text);
    const validated = validateExtractedExams(parsed);

    return {
      data: validated,
      provider: "openrouter",
      model,
    };
  }
}
