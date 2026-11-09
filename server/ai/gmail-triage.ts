import { GoogleGenAI, Type } from "@google/genai";
import { getGeminiApiKey } from "./gemini-adapter.js";
import { AIError } from "./types.js";

export interface CandidateEmailInput {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  bodyText: string;
}

export interface ExtractedEmailDeadline {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  course: string | null;
  type: "assignment" | "exam" | "quiz" | "project" | "other";
  needsDate: boolean;
  notes: string | null;
}

export interface EmailTriageResult {
  id: string;
  threadId: string;
  verdict: "relevant" | "maybe" | "ignore";
  confidence: number;
  reason: string;
  course: string | null;
  extracted: ExtractedEmailDeadline | null;
}

/**
 * Triages and extracts deadlines from a list of candidate Gmail messages.
 */
export async function triageAndExtractEmails(
  messages: CandidateEmailInput[],
  referenceDate: string = new Date().toISOString().split("T")[0],
  userTimeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
): Promise<EmailTriageResult[]> {
  if (!messages || messages.length === 0) {
    return [];
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    // Graceful fallback if no API key configured: mark all as "maybe" so nothing is dropped
    return messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      verdict: "maybe",
      confidence: 0.5,
      reason: "AI key not configured; flagged for user review.",
      course: null,
      extracted: {
        title: m.subject.replace(/^(Fwd:|Re:|\s)+/i, "").trim() || "Gmail Academic Notice",
        dueDate: null,
        dueTime: null,
        course: null,
        type: "assignment",
        needsDate: true,
        notes: `From: ${m.from}`,
      },
    }));
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const systemPrompt = `You are the specialized Gmail Academic Triage & Deadline Extractor for DeadlineIQ.
Today's reference date is ${referenceDate} and user's timezone is ${userTimeZone}.

Your task is to analyze candidate emails received by a university student and evaluate whether each email contains academic work, assignment deadlines, project submissions, exam/quiz announcements, syllabus updates, or lab reports.

STRICT VERDICT RULES:
1. "relevant": Clear academic work, assignment, homework, project deadline, exam date, quiz notice, or submission instructions.
2. "maybe": Ambiguous academic emails, general course announcements, newsletter reminders, or emails where deadline date/time is uncertain. Bias toward "maybe" when unsure. NEVER force an email to "ignore" if it could be academic.
3. "ignore": Pure marketing, spam, security login notifications, automated account password resets, social updates, or completely non-academic messages.

EXTRACTION RULES (for relevant & maybe):
- title: Concise descriptive title of the task/exam (e.g. "Problem Set 4 Submission", "Midterm 2 Exam").
- dueDate: YYYY-MM-DD format if explicitly stated or determinable relative to sent date "${referenceDate}". If NO explicit or relative calendar date is given, return NULL. Do NOT guess or invent dates!
- dueTime: 24-hour HH:mm time if specified (e.g. "23:59", "17:00"), else null.
- course: Academic course name or subject code (e.g. "CS101", "Physics II"), else null.
- type: Categorize into ["assignment", "exam", "quiz", "project", "other"].
- needsDate: Set to true ONLY if dueDate is null/missing.
- notes: 1 short sentence summary of requirements.`;

  const formattedEmails = messages.map((m, idx) => ({
    emailIndex: idx,
    id: m.id,
    threadId: m.threadId,
    subject: m.subject,
    sender: m.from,
    dateSent: m.date,
    content: m.bodyText.slice(0, 2000),
  }));

  const userPrompt = `CANDIDATE EMAILS TO TRIAGE & EXTRACT (${messages.length} items):
${JSON.stringify(formattedEmails, null, 2)}

Analyze each email and return a JSON array matching the response schema.`;

  const responseSchema = {
    type: Type.ARRAY,
    description: "Triage results and extracted deadlines per email",
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "Gmail message ID" },
        threadId: { type: Type.STRING, description: "Gmail thread ID" },
        verdict: { type: Type.STRING, enum: ["relevant", "maybe", "ignore"] },
        confidence: { type: Type.NUMBER, description: "Confidence score between 0.0 and 1.0" },
        reason: { type: Type.STRING, description: "One concise sentence explaining the verdict" },
        course: { type: Type.STRING, description: "Extracted course name or code, or null" },
        extracted: {
          type: Type.OBJECT,
          description: "Extracted deadline details if relevant or maybe, else null",
          properties: {
            title: { type: Type.STRING, description: "Task title" },
            dueDate: { type: Type.STRING, description: "YYYY-MM-DD or null if missing" },
            dueTime: { type: Type.STRING, description: "HH:mm or null if missing" },
            course: { type: Type.STRING, description: "Course name or null" },
            type: { type: Type.STRING, enum: ["assignment", "exam", "quiz", "project", "other"] },
            needsDate: { type: Type.BOOLEAN, description: "True if dueDate is null" },
            notes: { type: Type.STRING, description: "Short instructions summary" },
          },
          required: ["title", "type", "needsDate"],
        },
      },
      required: ["id", "threadId", "verdict", "confidence", "reason"],
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [{ text: userPrompt }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const rawText = response.text?.trim() || "[]";
    const parsed = JSON.parse(rawText);

    if (Array.isArray(parsed)) {
      return messages.map((m) => {
        const found = parsed.find((p: any) => p.id === m.id || p.threadId === m.threadId);
        if (found) {
          const confidence = typeof found.confidence === "number" ? Math.min(1, Math.max(0, found.confidence)) : 0.7;
          return {
            id: m.id,
            threadId: m.threadId,
            verdict: ["relevant", "maybe", "ignore"].includes(found.verdict) ? found.verdict : "maybe",
            confidence,
            reason: found.reason || "Evaluated by AI triage.",
            course: found.course || null,
            extracted: found.extracted
              ? {
                  title: found.extracted.title || m.subject,
                  dueDate: found.extracted.dueDate || null,
                  dueTime: found.extracted.dueTime || null,
                  course: found.extracted.course || found.course || null,
                  type: ["assignment", "exam", "quiz", "project", "other"].includes(found.extracted.type)
                    ? found.extracted.type
                    : "assignment",
                  needsDate: Boolean(found.extracted.needsDate || !found.extracted.dueDate),
                  notes: found.extracted.notes || null,
                }
              : null,
          };
        }

        // Fallback for missing item in AI response
        return {
          id: m.id,
          threadId: m.threadId,
          verdict: "maybe",
          confidence: 0.5,
          reason: "Triage response missing for email; flagged for review.",
          course: null,
          extracted: {
            title: m.subject.replace(/^(Fwd:|Re:|\s)+/i, "").trim() || "Gmail Academic Notice",
            dueDate: null,
            dueTime: null,
            course: null,
            type: "assignment",
            needsDate: true,
            notes: `From: ${m.from}`,
          },
        };
      });
    }
  } catch (err) {
    console.warn("AI Email triage failed; applying safe 'maybe' fallback:", err);
  }

  // Safe fallback if JSON parsing or AI call failed
  return messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    verdict: "maybe",
    confidence: 0.5,
    reason: "AI triage temporary fallback; flagged for review.",
    course: null,
    extracted: {
      title: m.subject.replace(/^(Fwd:|Re:|\s)+/i, "").trim() || "Gmail Academic Notice",
      dueDate: null,
      dueTime: null,
      course: null,
      type: "assignment",
      needsDate: true,
      notes: `From: ${m.from}`,
    },
  }));
}
