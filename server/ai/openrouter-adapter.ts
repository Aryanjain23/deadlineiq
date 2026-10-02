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

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter free router model
const OPENROUTER_MODELS = [
  "openrouter/free",
];

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
      message: "OpenRouter rate limit exceeded or quota exhausted.",
      code: "RATE_LIMIT",
      provider: "openrouter",
      status: 429,
      isRetryable: true,
      cause: err,
    });
  }

  // Timeout
  if (
    statusCode === 504 ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    err?.name === "AbortError" ||
    err?.name === "TimeoutError"
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

  // Unavailable
  if (
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 500 ||
    lowerMsg.includes("unavailable") ||
    lowerMsg.includes("bad gateway")
  ) {
    return new AIError({
      message: "OpenRouter service is temporarily unavailable.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "openrouter",
      status: statusCode || 503,
      isRetryable: true,
      cause: err,
    });
  }

  return new AIError({
    message: rawMsg.length < 200 ? rawMsg : "Error communicating with OpenRouter service.",
    code: "UNKNOWN",
    provider: "openrouter",
    status: statusCode,
    isRetryable: true,
    cause: err,
  });
}

export class OpenRouterProviderAdapter implements AIProviderAdapter {
  public readonly name = "openrouter" as const;

  public isAvailable(): boolean {
    return Boolean(getOpenRouterApiKey());
  }

  private async callChatCompletion(
    messages: any[],
    model: string,
    apiKey: string
  ): Promise<{ content: string; model: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://deadlineiq.app",
          "X-Title": "DeadlineIQ",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
          max_tokens: 3500,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errJson: any = null;
        try {
          errJson = await response.json();
        } catch {}
        const errorText = errJson?.error?.message || errJson?.message || response.statusText;
        throw formatOpenRouterError(new Error(errorText), response.status);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content?.trim() || "";
      const actualModel = data?.model || model;

      if (!content) {
        throw new AIError({
          message: "OpenRouter returned an empty response.",
          code: "MALFORMED_OUTPUT",
          provider: "openrouter",
          isRetryable: true,
        });
      }

      return { content, model: actualModel };
    } catch (err: any) {
      throw formatOpenRouterError(err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async extractDeadlines(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedDeadline[]>> {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new AIError({
        message: "OPENROUTER_API_KEY environment variable is not configured.",
        code: "MISSING_API_KEY",
        provider: "openrouter",
        isRetryable: false,
      });
    }

    const currentDate = payload.currentDate || new Date().toISOString().split("T")[0];

    const systemPrompt = `You are the Academic Notice Deadline Extractor for DeadlineIQ.
Today's reference date is ${currentDate}.
Your goal is to accurately extract all identifiable academic assignments, lab records, tutorial problem sets, projects, homework, or exam submissions from academic notices, messages, or images.

You MUST respond strictly with a valid JSON object matching this structure:
{
  "deadlines": [
    {
      "taskName": "Descriptive title of task",
      "subject": "Course or subject name",
      "hasExplicitDate": true or false,
      "explicitDueDate": "YYYY-MM-DD" or null,
      "explicitDueDayOfWeek": "Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"|"Saturday"|"Sunday" or null,
      "isRelativeClassMention": true if submission is 'next class/lecture/lab' else false,
      "dueTime": "HH:mm" (24-hour) or null,
      "importance": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "description": "Short 1-2 sentence summary of requirements",
      "confidenceLevel": "HIGH" | "MEDIUM" | "LOW",
      "geminiReasoning": "1-2 sentences explaining cues and dates found",
      "sourceType": "SYLLABUS" | "CANVAS" | "EMAIL" | "ASSIGNMENT" | "CLASS_NOTICE" | "OTHER",
      "isDateAmbiguous": true if date is ambiguous or missing else false,
      "ambiguityNote": "Explanation if date is ambiguous or missing" or null,
      "notes": "Any additional submission or special notes" or null
    }
  ]
}

RULES:
1. Extract ALL distinct academic tasks.
2. The AI must NEVER invent a date, time, subject, or deadline. If NO explicit calendar date is mentioned, explicitDueDate must be null, hasExplicitDate must be false, and isDateAmbiguous must be true.
3. If no deadlines are found, return {"deadlines": []}.
4. Output valid JSON only, without any commentary.`;

    const userMessageContent: any[] = [];

    // If file was uploaded
    if (payload.file && payload.file.base64) {
      let rawBase64 = payload.file.base64;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }
      const mime = payload.file.mimeType || "image/png";

      if (mime.startsWith("image/")) {
        userMessageContent.push({
          type: "image_url",
          image_url: {
            url: `data:${mime};base64,${rawBase64}`,
          },
        });
      } else {
        // PDF or non-image document
        userMessageContent.push({
          type: "text",
          text: `[Attached Document: ${payload.file.name || "academic-notice.pdf"}]`,
        });
      }
    }

    let textPrompt = payload.text ? `ACADEMIC NOTICE TEXT:\n${payload.text.trim()}` : "";
    if (payload.file?.name) {
      textPrompt += `\n(Source File: ${payload.file.name})`;
    }
    textPrompt += `\n\nExtract all academic tasks from this notice into the requested JSON schema.`;

    userMessageContent.push({
      type: "text",
      text: textPrompt,
    });

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessageContent },
    ];

    let lastError: AIError | null = null;

    for (const model of OPENROUTER_MODELS) {
      try {
        const { content, model: usedModel } = await this.callChatCompletion(
          messages,
          model,
          apiKey
        );

        const parsed = safeParseJson(content);
        const validated = validateExtractedDeadlines(parsed);

        return {
          data: validated,
          provider: "openrouter",
          model: usedModel,
        };
      } catch (err: any) {
        const formatted = formatOpenRouterError(err);
        lastError = formatted;

        if (formatted.code === "AUTHENTICATION_FAILED") {
          throw formatted;
        }

        console.warn(`OpenRouter model ${model} extraction failed:`, formatted.message);
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    throw lastError || new AIError({
      message: "All OpenRouter candidate models failed to extract deadlines.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "openrouter",
    });
  }

  public async generatePlanMyDay(
    payload: PlanMyDayPayload
  ): Promise<AIResult<GeneratedScheduleBlock[]>> {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new AIError({
        message: "OPENROUTER_API_KEY environment variable is not configured.",
        code: "MISSING_API_KEY",
        provider: "openrouter",
        isRetryable: false,
      });
    }

    const { currentDate, currentTime, preferences, fixedCommitments, activeDeadlines } = payload;
    const { startTime, endTime, sessionLengthMinutes, breakLengthMinutes } = preferences;

    const systemPrompt = `You are the intelligent Academic Daily Planner for DeadlineIQ.
Today's date is ${currentDate} and current local time is ${currentTime}.
Your task is to generate a realistic, structured, conflict-free daily schedule for the user between ${startTime} and ${endTime}.

You MUST respond strictly with a valid JSON object matching this structure:
{
  "blocks": [
    {
      "id": "block-1",
      "startTime": "09:00",
      "endTime": "10:00",
      "activity": "Activity title",
      "type": "class" | "task" | "event" | "break",
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "deadlineId": "matching-id-from-active-deadlines-or-empty",
      "subject": "Subject name if applicable",
      "reason": "Rationale for scheduling",
      "location": "Room or location if applicable"
    }
  ]
}

CORE SAFETY RULES:
1. FIXED COMMITMENTS: Classes and events in FIXED_COMMITMENTS are immovable. Include each between ${startTime} and ${endTime} with exact startTime and endTime.
2. NO FAKE DATA: You may ONLY schedule task blocks that directly correspond to an item in ACTIVE_DEADLINES. Set deadlineId to exact id.
3. NO PAST SCHEDULING: Do NOT schedule new work blocks before ${currentTime}.
4. STRICT PRIORITY ORDER: Overdue tasks first, then tasks due today, then tasks due soon, then high/critical.
5. REALISTIC BREAKS: Add break blocks (~${breakLengthMinutes} mins) between focused tasks.
6. NO OVERLAPPING BLOCKS: Sort output chronologically.
7. If no active deadlines and no fixed commitments, return {"blocks": []}.
8. Return valid JSON only.`;

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

Generate the complete chronological schedule as a JSON object with "blocks".`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let lastError: AIError | null = null;

    for (const model of OPENROUTER_MODELS) {
      try {
        const { content, model: usedModel } = await this.callChatCompletion(
          messages,
          model,
          apiKey
        );

        const parsed = safeParseJson(content);
        const validated = validateScheduleBlocks(parsed);

        return {
          data: validated,
          provider: "openrouter",
          model: usedModel,
        };
      } catch (err: any) {
        const formatted = formatOpenRouterError(err);
        lastError = formatted;

        if (formatted.code === "AUTHENTICATION_FAILED") {
          throw formatted;
        }

        console.warn(`OpenRouter model ${model} plan generation failed:`, formatted.message);
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    throw lastError || new AIError({
      message: "All OpenRouter candidate models failed to generate daily plan.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "openrouter",
    });
  }
}
