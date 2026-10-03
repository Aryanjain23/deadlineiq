import { GoogleGenAI, Type } from "@google/genai";
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
} from "./types.js";
import {
  safeParseJson,
  validateExtractedDeadlines,
  validateExtractedTimetable,
  validateExtractedExams,
  validateScheduleBlocks,
} from "./validator.js";
import { extractTextFromPdf, cleanPdfText } from "./pdf-parser.js";

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const REQUEST_TIMEOUT_MS = 25000;

export function getGeminiApiKey(): string {
  let key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();

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
          const geminiMatch = content.match(/GEMINI_API_KEY=([^\r\n]+)/);
          if (geminiMatch && geminiMatch[1]) {
            const candidateKey = geminiMatch[1].trim();
            if (candidateKey && candidateKey !== "MY_GEMINI_API_KEY") {
              key = candidateKey;
              break;
            }
          }
          const googleMatch = content.match(/GOOGLE_API_KEY=([^\r\n]+)/);
          if (googleMatch && googleMatch[1]) {
            const candidateKey = googleMatch[1].trim();
            if (candidateKey && candidateKey !== "MY_GEMINI_API_KEY") {
              key = candidateKey;
              break;
            }
          }
        }
      } catch {}
    }
  }

  if (!key || key === "MY_GEMINI_API_KEY") {
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

  // JSON syntax / malformed output error
  if (
    message.includes("JSON") ||
    message.includes("SyntaxError") ||
    message.includes("Unexpected end") ||
    message.includes("Unexpected token")
  ) {
    return new AIError({
      message: "Model response format was incomplete. Retrying with fallback...",
      code: "MALFORMED_OUTPUT",
      provider: "gemini",
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

/**
 * Executes a promise with an automatic timeout.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationDesc: string): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new AIError({
          message: `Gemini ${operationDesc} timed out after ${timeoutMs / 1000}s.`,
          code: "TIMEOUT",
          provider: "gemini",
          isRetryable: true,
        })
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
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
Your goal is to accurately extract all identifiable academic assignments, lab records, tutorial problem sets, projects, homework, or exam submissions from academic notices or circulars.

RULES:
1. Extract ALL distinct academic tasks/deadlines mentioned.
2. taskName: Descriptive, clean title (e.g., "Physics Lab Record Experiment 4", "Tutorial Sheet 3", "LTSpice Op-Amp Simulation Report").
3. subject: Identify the academic subject or course (e.g. "Physics", "Mathematics", "Electronics", "Computer Aided Design", or course code).
4. hasExplicitDate: Set to true ONLY if the notice explicitly specifies an actual calendar date (e.g., "October 15", "12/10/2026", "28th Sep").
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
12. geminiReasoning: 1-2 concise sentences explaining what specific cues were identified.`;

    const contents: any[] = [];
    let extractedPdfText = "";
    let isTextBasedPdf = false;

    // Optimized PDF vs Image pipeline
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

      // If it's a scanned PDF (no text layer) or an image, use multimodal vision
      if (!isTextBasedPdf) {
        contents.push({
          inlineData: {
            data: rawBase64,
            mimeType: mime,
          },
        });
      }
    }

    let textPrompt = payload.text ? `ACADEMIC NOTICE TEXT:\n${payload.text.trim()}` : "";
    if (extractedPdfText) {
      textPrompt += `\n\nEXTRACTED DOCUMENT TEXT:\n${extractedPdfText.slice(0, 8000)}`;
    }
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
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema,
            },
          }),
          REQUEST_TIMEOUT_MS,
          `deadline extraction with model ${model}`
        );

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

        console.log(`[Gemini] Model ${model} extraction unavailable, trying next candidate:`, formatted.message);
        await new Promise((r) => setTimeout(r, 100));
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
Today's date is ${currentDate} and current local time is ${currentTime}.
Your task is to generate an intelligent, realistic, structured, conflict-free daily schedule for the user between ${startTime} and ${endTime}.

PRIORITY ORDER FOR SCHEDULING TIME SLOTS:
1. FIXED COMMITMENTS (Classes, Today's Exams, Calendar Events):
   - Immovable. Retain their exact times, location, and subject.
2. URGENT & ACTIVE DEADLINES:
   - Overdue tasks, tasks due today, and tasks due in 1-2 days.
   - Schedule focused work sessions (approx ${sessionLengthMinutes} mins).
   - Set 'deadlineId' to the matching ID from ACTIVE_DEADLINES.
   - Reason should be short (e.g. "Due tomorrow", "Due today", "Due in 3 days", "Overdue by 1 day").
3. REVISION FOR UPCOMING EXAMS:
   - If user has upcoming exams in UPCOMING_EXAMS, allocate targeted revision sessions (type: 'revision').
   - Reason should be short (e.g. "Exam in 4 days", "Exam in 2 days").
4. INTELLIGENT FREE-TIME PLANNING (When time is available):
   - For enrolled subjects (in USER_SUBJECTS) or available free time, suggest meaningful activities:
     * Review lecture notes or recently studied concepts (type: 'review', reason: "Course review")
     * Practical technical skill practice/problem solving (type: 'skill', reason: "Skill practice")
     * Low-intensity academic organization or study space cleanup (type: 'organize', reason: "Organize academic work")
     * Restorative break, short walk, or personal productivity (type: 'break', reason: "Break")
   - Ground suggestions in the user's subjects when available.
   - If user has no academic data, suggest balanced skill/learning/productivity activities.

CORE RULES:
- Keep reasons short, crisp, and useful (max 4-6 words, e.g. "Due tomorrow", "Exam in 4 days", "Skill practice").
- Set 'isAiRecommendation' to true for suggested revision/review/skill/organize activities, and false for fixed commitments or deadline tasks.
- Do NOT fill every minute back-to-back; preserve genuine free time and breaks (~${breakLengthMinutes} mins).
- No overlapping blocks. Sort chronologically.`;

    const userPrompt = `USER ACADEMIC CONTEXT:
CURRENT DATE: ${currentDate}
CURRENT TIME: ${currentTime}
AVAILABLE WINDOW: ${startTime} to ${endTime}
TARGET SESSION LENGTH: ${sessionLengthMinutes} minutes
BREAK DURATION: ${breakLengthMinutes} minutes

FIXED_COMMITMENTS (Immovable):
${JSON.stringify(fixedCommitments, null, 2)}

ACTIVE_DEADLINES (Pending tasks to schedule):
${JSON.stringify(activeDeadlines, null, 2)}

UPCOMING_EXAMS (Within next 14 days):
${JSON.stringify(upcomingExams, null, 2)}

RECENTLY_COMPLETED_TASKS:
${JSON.stringify(completedTasks, null, 2)}

ENROLLED_COURSES_AND_SUBJECTS:
${JSON.stringify(userSubjects, null, 2)}

Generate the complete, context-aware chronological schedule for today.`;

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
              type: {
                type: Type.STRING,
                enum: ["class", "task", "event", "break", "revision", "skill", "review", "organize"],
              },
              priority: { type: Type.STRING, enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
              deadlineId: { type: Type.STRING, description: "Matching deadline id if type is task, else empty string" },
              subject: { type: Type.STRING, description: "Subject or course name if applicable" },
              reason: { type: Type.STRING, description: "Context-grounded rationale for scheduling" },
              location: { type: Type.STRING, description: "Classroom or event location if provided" },
              isAiRecommendation: { type: Type.BOOLEAN, description: "True if block is an AI-suggested recommendation" },
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
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: [{ text: userPrompt }],
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema,
            },
          }),
          REQUEST_TIMEOUT_MS,
          `plan generation with model ${model}`
        );

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

        console.log(`[Gemini] Model ${model} plan generation unavailable, trying next candidate:`, formatted.message);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    throw lastError || new AIError({
      message: "All Gemini candidate models failed to generate daily plan.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
    });
  }

  public async extractTimetable(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedTimetableEntry[]>> {
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

    const systemPrompt = `You are the specialized Weekly Class Timetable Extractor for DeadlineIQ.
Your task is to accurately extract scheduled weekly recurring lectures, practicals, labs, and tutorials from academic timetable documents, images, or PDFs.

RULES:
1. Extract every valid scheduled recurring class slot into a separate item.
2. day: Must be one of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].
3. startTime: 24-hour time "HH:mm" (e.g., "09:00", "11:30", "14:00").
4. endTime: 24-hour time "HH:mm" (e.g., "10:00", "12:30", "16:00").
   - If a multi-hour lab spans 09:00 to 12:00 or 14:00 to 17:00, extract it with startTime="09:00", endTime="12:00".
   - If only a start time or duration is present, infer standard slot end time.
5. subject: The full name of the academic course or subject. Expand obvious abbreviations if context is clear (e.g. "DSA" -> "Data Structures & Algorithms", "CN" -> "Computer Networks").
6. subjectCode: Course code if printed (e.g., "21CS51", "MAT201", "CS302"). Otherwise null.
7. faculty: Instructor or professor name if identified in the cell or legend. Otherwise null.
8. room: Classroom number, lecture hall, or lab name (e.g., "Room 304", "Lab 2", "LH-1"). Otherwise null.
9. section: Section/batch if specified (e.g., "Sec A", "Batch B1"). Otherwise null.
10. IGNORE empty cells, lunch breaks, recess, intervals, tea breaks, and holiday notes. DO NOT create classes for "Lunch", "Break", "Free", or "-".
11. confidenceLevel: "HIGH" if clean and unambiguous, "MEDIUM" if partially unclear, "LOW" if heavily abbreviated.
12. isUncertain: Set to true if times or days were difficult to decipher.
13. NEVER invent classes or subjects not present in the document.`;

    const contents: any[] = [];
    let extractedPdfText = "";
    let isTextBasedPdf = false;

    // Optimized text-based vs scanned PDF pipeline
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

      // Only pass heavy binary data if it is an image or a scanned PDF with no text stream
      if (!isTextBasedPdf) {
        contents.push({
          inlineData: {
            data: rawBase64,
            mimeType: mime,
          },
        });
      }
    }

    let textPrompt = payload.text ? `TIMETABLE TEXT / CONTEXT:\n${payload.text.trim()}` : "";
    if (extractedPdfText) {
      textPrompt += `\n\nEXTRACTED DOCUMENT TEXT LAYER:\n${extractedPdfText.slice(0, 8000)}`;
    }
    if (payload.file?.name) {
      textPrompt += `\n(Source File: ${payload.file.name})`;
    }
    textPrompt += `\n\nAnalyze this timetable document thoroughly. Extract all weekly classes into the structured JSON schema.`;

    contents.push({ text: textPrompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        entries: {
          type: Type.ARRAY,
          description: "List of weekly recurring class timetable entries",
          items: {
            type: Type.OBJECT,
            properties: {
              day: {
                type: Type.STRING,
                enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              },
              startTime: { type: Type.STRING, description: "HH:mm format (24-hour)" },
              endTime: { type: Type.STRING, description: "HH:mm format (24-hour)" },
              subject: { type: Type.STRING, description: "Subject or course title" },
              subjectCode: { type: Type.STRING, description: "Course code if present" },
              faculty: { type: Type.STRING, description: "Teacher or instructor name if present" },
              room: { type: Type.STRING, description: "Classroom or lab name if present" },
              section: { type: Type.STRING, description: "Section or batch if present" },
              confidenceLevel: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
              isUncertain: { type: Type.BOOLEAN },
              notes: { type: Type.STRING },
            },
            required: ["day", "startTime", "endTime", "subject"],
          },
        },
      },
      required: ["entries"],
    };

    let lastError: AIError | null = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema,
            },
          }),
          REQUEST_TIMEOUT_MS,
          `timetable extraction with model ${model}`
        );

        const rawText = response.text?.trim() || "";
        const parsed = safeParseJson(rawText);
        const validated = validateExtractedTimetable(parsed);

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

        console.log(`[Gemini] Model ${model} timetable extraction unavailable, trying next candidate:`, formatted.message);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    throw lastError || new AIError({
      message: "All Gemini candidate models failed to extract timetable.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
    });
  }

  public async extractExams(
    payload: ExtractRequestPayload
  ): Promise<AIResult<ExtractedExamEntry[]>> {
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

    const systemPrompt = `You are the specialized Examination Schedule Extractor for DeadlineIQ.
Today's reference date is ${currentDate}.
Your task is to extract all scheduled tests, midterms, semester examinations (SEE), internal assessments (CIE/IA), practical exams, and quizzes from exam timetable documents, notices, or date sheets.

RULES:
1. Extract EVERY distinct scheduled exam as a separate candidate item.
2. subject: The subject or course name for the exam (e.g., "Engineering Mathematics IV", "Operating Systems", "Microcontrollers Lab").
3. subjectCode: Course or exam subject code if listed (e.g., "18CS43", "MAT401"). Otherwise null.
4. examDate: Resolve explicit date to format "YYYY-MM-DD". If the document gives "14-11-2026" or "Nov 14, 2026", resolve to "2026-11-14". If date is ambiguous, leave null or set isDateAmbiguous=true. NEVER INVENT DATES.
5. startTime: 24-hour time "HH:mm" (e.g. "09:30", "14:00"). If missing, return null.
6. endTime: 24-hour time "HH:mm" if specified (e.g. "12:30", "17:00"). If not specified, return null.
7. examType: Categorize into one of:
   - "SEE": Semester End Exam / Final University Examination / Main Exam.
   - "Internal": Midterms / Continuous Internal Evaluation (CIE) / Unit Tests / Term Exams.
   - "Lab": Practical / Laboratory Examinations / Viva Voce.
   - "Quiz": Short tests / Quizzes.
   - "Practical": Hands-on assessments / Workshops.
   - "Other": Other evaluations.
8. room: Examination hall, block, or seating room if specified (e.g., "Hall 3B", "Main Auditorium", "Room 201"). Otherwise null.
9. semesterBranch: Semester, branch, or department if present (e.g., "4th Sem CSE", "EC / EEE"). Otherwise null.
10. confidenceLevel: "HIGH" if explicit and complete, "MEDIUM" if date or time had minor ambiguity, "LOW" if heavily inferred.
11. isDateAmbiguous: True if the exact calendar date could not be established with certainty.
12. ambiguityNote: Brief note if date or timing was ambiguous.`;

    const contents: any[] = [];
    let extractedPdfText = "";
    let isTextBasedPdf = false;

    // Optimized text-based vs scanned PDF pipeline
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

      // Only pass heavy binary data if it is an image or a scanned PDF with no text stream
      if (!isTextBasedPdf) {
        contents.push({
          inlineData: {
            data: rawBase64,
            mimeType: mime,
          },
        });
      }
    }

    let textPrompt = payload.text ? `EXAM TIMETABLE / DATE SHEET TEXT:\n${payload.text.trim()}` : "";
    if (extractedPdfText) {
      textPrompt += `\n\nEXTRACTED DOCUMENT TEXT LAYER:\n${extractedPdfText.slice(0, 8000)}`;
    }
    if (payload.file?.name) {
      textPrompt += `\n(Source File: ${payload.file.name})`;
    }
    textPrompt += `\n\nAnalyze this exam timetable carefully. Extract all exam schedule entries into the structured JSON schema.`;

    contents.push({ text: textPrompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        exams: {
          type: Type.ARRAY,
          description: "List of extracted examination entries",
          items: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING, description: "Exam subject or course name" },
              subjectCode: { type: Type.STRING, description: "Subject code if provided" },
              examDate: { type: Type.STRING, description: "YYYY-MM-DD format if date found, else null" },
              startTime: { type: Type.STRING, description: "HH:mm format (24-hour) if found, else null" },
              endTime: { type: Type.STRING, description: "HH:mm format (24-hour) if found, else null" },
              examType: {
                type: Type.STRING,
                enum: ["Internal", "Lab", "SEE", "Quiz", "Practical", "Other"],
              },
              room: { type: Type.STRING, description: "Exam hall or room" },
              semesterBranch: { type: Type.STRING, description: "Semester or department info" },
              confidenceLevel: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
              isDateAmbiguous: { type: Type.BOOLEAN },
              ambiguityNote: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
            required: ["subject"],
          },
        },
      },
      required: ["exams"],
    };

    let lastError: AIError | null = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema,
            },
          }),
          REQUEST_TIMEOUT_MS,
          `exam extraction with model ${model}`
        );

        const rawText = response.text?.trim() || "";
        const parsed = safeParseJson(rawText);
        const validated = validateExtractedExams(parsed);

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

        console.log(`[Gemini] Model ${model} exam extraction unavailable, trying next candidate:`, formatted.message);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    throw lastError || new AIError({
      message: "All Gemini candidate models failed to extract exams.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
    });
  }
}
