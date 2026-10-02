import {
  ExtractedDeadline,
  GeneratedScheduleBlock,
  AIError,
} from "./types";

const VALID_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const VALID_IMPORTANCE = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const VALID_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
const VALID_BLOCK_TYPES = ["class", "task", "event", "break"] as const;

/**
 * Safely parses JSON from an LLM response string, removing markdown code fences
 * and trailing commas if present.
 */
export function safeParseJson<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== "string") {
    throw new AIError({
      message: "Model returned an empty or non-string response.",
      code: "MALFORMED_OUTPUT",
      isRetryable: true,
    });
  }

  let cleaned = rawText.trim();

  // Strip markdown code fences (```json ... ``` or ``` ...)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
    cleaned = cleaned.replace(/\n?```\s*$/i, "");
    cleaned = cleaned.trim();
  }

  // Attempt direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch (initialErr: any) {
    // Attempt to extract the first balanced JSON array or object
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");

    let sliceStart = -1;
    let sliceEnd = -1;

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      sliceStart = firstBracket;
      sliceEnd = cleaned.lastIndexOf("]");
    } else if (firstBrace !== -1) {
      sliceStart = firstBrace;
      sliceEnd = cleaned.lastIndexOf("}");
    }

    if (sliceStart !== -1 && sliceEnd !== -1 && sliceEnd > sliceStart) {
      const subSlice = cleaned.slice(sliceStart, sliceEnd + 1);
      try {
        return JSON.parse(subSlice);
      } catch {}
    }

    throw new AIError({
      message: "Failed to parse structured JSON from model response.",
      code: "MALFORMED_OUTPUT",
      isRetryable: true,
      cause: initialErr,
    });
  }
}

/**
 * Validates and sanitizes extracted deadlines array from model output.
 */
export function validateExtractedDeadlines(data: any): ExtractedDeadline[] {
  let list: any[] = [];

  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.deadlines)) {
      list = data.deadlines;
    } else if (Array.isArray(data.tasks)) {
      list = data.tasks;
    } else if (Array.isArray(data.items)) {
      list = data.items;
    }
  }

  if (!Array.isArray(list)) {
    throw new AIError({
      message: "Model output did not contain an array of deadlines.",
      code: "MALFORMED_OUTPUT",
      isRetryable: true,
    });
  }

  const validated: ExtractedDeadline[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;

    const taskName = String(item.taskName || item.title || item.name || "").trim();
    if (!taskName) continue;

    const subject = String(item.subject || item.course || "Coursework").trim();

    // Explicit date validation (YYYY-MM-DD)
    let explicitDueDate: string | null = null;
    let hasExplicitDate = Boolean(item.hasExplicitDate);

    if (item.explicitDueDate && typeof item.explicitDueDate === "string") {
      const trimmedDate = item.explicitDueDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        explicitDueDate = trimmedDate;
        hasExplicitDate = true;
      }
    }

    // Day of week
    let explicitDueDayOfWeek: string | null = null;
    if (item.explicitDueDayOfWeek && typeof item.explicitDueDayOfWeek === "string") {
      const normalizedDay = item.explicitDueDayOfWeek.trim().toLowerCase();
      const matchedDay = VALID_DAYS.find((d) => d.toLowerCase() === normalizedDay);
      if (matchedDay) {
        explicitDueDayOfWeek = matchedDay;
      }
    }

    // Due time (HH:mm)
    let dueTime: string | null = null;
    if (item.dueTime && typeof item.dueTime === "string") {
      const trimmedTime = item.dueTime.trim();
      const timeMatch = trimmedTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (timeMatch) {
        dueTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
      }
    }

    // Importance
    let importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (item.importance && typeof item.importance === "string") {
      const normalizedImp = item.importance.trim().toUpperCase();
      if (VALID_IMPORTANCE.includes(normalizedImp as any)) {
        importance = normalizedImp as any;
      }
    }

    // Confidence
    let confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (item.confidenceLevel && typeof item.confidenceLevel === "string") {
      const normalizedConf = item.confidenceLevel.trim().toUpperCase();
      if (VALID_CONFIDENCE.includes(normalizedConf as any)) {
        confidenceLevel = normalizedConf as any;
      }
    }

    const description = String(item.description || item.summary || "").trim();
    const geminiReasoning = String(
      item.geminiReasoning || item.reasoning || item.explanation || "Extracted from academic notice."
    ).trim();

    // Source Type
    const VALID_SOURCE_TYPES = ["SYLLABUS", "CANVAS", "EMAIL", "ASSIGNMENT", "CLASS_NOTICE", "OTHER"] as const;
    let sourceType: "SYLLABUS" | "CANVAS" | "EMAIL" | "ASSIGNMENT" | "CLASS_NOTICE" | "OTHER" = "CLASS_NOTICE";
    if (item.sourceType && typeof item.sourceType === "string") {
      const normalizedSource = item.sourceType.trim().toUpperCase();
      if (VALID_SOURCE_TYPES.includes(normalizedSource as any)) {
        sourceType = normalizedSource as any;
      }
    }

    // Ambiguity detection: explicit flag or lack of explicit date/relative mention
    const isDateAmbiguous = Boolean(
      item.isDateAmbiguous ||
      (!hasExplicitDate && !item.isRelativeClassMention) ||
      (item.ambiguityNote && String(item.ambiguityNote).trim().length > 0)
    );

    const ambiguityNote = item.ambiguityNote
      ? String(item.ambiguityNote).trim()
      : !hasExplicitDate && !item.isRelativeClassMention
      ? "No explicit calendar date was specified in this notice."
      : null;

    const notes = item.notes ? String(item.notes).trim() : null;

    validated.push({
      taskName,
      subject,
      hasExplicitDate,
      explicitDueDate,
      explicitDueDayOfWeek,
      isRelativeClassMention: Boolean(item.isRelativeClassMention),
      dueTime,
      importance,
      description,
      confidenceLevel,
      geminiReasoning,
      sourceType,
      isDateAmbiguous,
      ambiguityNote,
      notes,
    });
  }

  return validated;
}

/**
 * Validates and sanitizes daily schedule blocks from model output.
 */
export function validateScheduleBlocks(data: any): GeneratedScheduleBlock[] {
  let blocksArray: any[] = [];

  if (data && Array.isArray(data.blocks)) {
    blocksArray = data.blocks;
  } else if (Array.isArray(data)) {
    blocksArray = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.schedule)) {
      blocksArray = data.schedule;
    }
  }

  if (!Array.isArray(blocksArray)) {
    throw new AIError({
      message: "Model output did not contain a valid schedule blocks array.",
      code: "MALFORMED_OUTPUT",
      isRetryable: true,
    });
  }

  const validated: GeneratedScheduleBlock[] = [];

  for (let i = 0; i < blocksArray.length; i++) {
    const b = blocksArray[i];
    if (!b || typeof b !== "object") continue;

    const activity = String(b.activity || b.title || b.name || "Focus Session").trim();
    const startTimeRaw = String(b.startTime || "").trim();
    const endTimeRaw = String(b.endTime || "").trim();

    // Verify time format (HH:mm)
    const startMatch = startTimeRaw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    const endMatch = endTimeRaw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

    if (!startMatch || !endMatch) continue;

    const startTime = `${startMatch[1].padStart(2, "0")}:${startMatch[2]}`;
    const endTime = `${endMatch[1].padStart(2, "0")}:${endMatch[2]}`;

    let type: "class" | "task" | "event" | "break" = "task";
    if (b.type && typeof b.type === "string") {
      const normalizedType = b.type.trim().toLowerCase();
      if (VALID_BLOCK_TYPES.includes(normalizedType as any)) {
        type = normalizedType as any;
      }
    }

    let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined = undefined;
    if (b.priority && typeof b.priority === "string") {
      const normalizedPri = b.priority.trim().toUpperCase();
      if (VALID_IMPORTANCE.includes(normalizedPri as any)) {
        priority = normalizedPri as any;
      }
    }

    const id = b.id ? String(b.id).trim() : `block-${i + 1}-${Date.now()}`;
    const deadlineId = b.deadlineId ? String(b.deadlineId).trim() : undefined;
    const subject = b.subject ? String(b.subject).trim() : undefined;
    const reason = b.reason ? String(b.reason).trim() : undefined;
    const location = b.location ? String(b.location).trim() : undefined;

    validated.push({
      id,
      startTime,
      endTime,
      activity,
      type,
      priority,
      deadlineId,
      subject,
      reason,
      location,
    });
  }

  return validated;
}
