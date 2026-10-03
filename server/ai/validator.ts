import {
  ExtractedDeadline,
  ExtractedTimetableEntry,
  ExtractedExamEntry,
  GeneratedScheduleBlock,
  ScheduleBlockType,
  AIError,
} from "./types.js";

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
const VALID_BLOCK_TYPES = [
  "class",
  "task",
  "event",
  "break",
  "revision",
  "skill",
  "review",
  "organize",
] as const;

/**
 * Removes markdown code fences, conversational preambles, trailing commas,
 * and smart quotes from LLM output.
 */
export function cleanJsonString(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "";

  let cleaned = rawText.trim();

  // Strip markdown code fences (```json ... ``` or ``` ...)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
    cleaned = cleaned.replace(/\n?```\s*$/i, "");
    cleaned = cleaned.trim();
  }

  // If code fences are somewhere inside the text
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*(?:```|$)/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // Replace smart / typographic quotes
  cleaned = cleaned
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  // Remove trailing commas before closing braces or brackets (e.g. [1, 2, ])
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  return cleaned.trim();
}

/**
 * Attempts to repair truncated JSON by finding the last fully closed object,
 * stripping trailing dangling properties/commas, and balancing open brackets/braces.
 */
export function repairTruncatedJson(str: string): string {
  let text = cleanJsonString(str);
  if (!text) return "";

  // If text is already valid, return as is
  try {
    JSON.parse(text);
    return text;
  } catch {}

  // 1. Locate the first array or object opening
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");

  let startIdx = 0;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }
  text = text.slice(startIdx);

  // 2. Find the last complete object boundary '}'
  const lastCloseBrace = text.lastIndexOf("}");
  if (lastCloseBrace !== -1) {
    let candidate = text.slice(0, lastCloseBrace + 1);

    // Remove any trailing comma
    candidate = candidate.replace(/,\s*$/, "");

    // Count open vs closed brackets/braces
    let openBrackets = 0;
    let openBraces = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < candidate.length; i++) {
      const char = candidate[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "[") openBrackets++;
        else if (char === "]") openBrackets = Math.max(0, openBrackets - 1);
        else if (char === "{") openBraces++;
        else if (char === "}") openBraces = Math.max(0, openBraces - 1);
      }
    }

    // Close any unclosed arrays and objects
    while (openBrackets > 0) {
      candidate += "]";
      openBrackets--;
    }
    while (openBraces > 0) {
      candidate += "}";
      openBraces--;
    }

    try {
      JSON.parse(candidate);
      return candidate;
    } catch {}
  }

  return text;
}

/**
 * Scans a string for all independently valid JSON objects { ... } using
 * balanced brace tracking.
 */
export function extractAllCompleteObjects(text: string): any[] {
  const objects: any[] = [];
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        if (depth === 0) {
          startIdx = i;
        }
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const slice = text.slice(startIdx, i + 1);
          try {
            const parsed = JSON.parse(slice);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              objects.push(parsed);
            }
          } catch {}
          startIdx = -1;
        }
      }
    }
  }

  return objects;
}

/**
 * Safely parses JSON from an LLM response string with multi-stage repair
 * and resilient partial extraction. Never throws a raw SyntaxError.
 */
export function safeParseJson<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    throw new AIError({
      message: "Model returned an empty response. Please try again or paste the text directly.",
      code: "MALFORMED_OUTPUT",
      isRetryable: true,
    });
  }

  const cleaned = cleanJsonString(rawText);

  // Strategy 1: Direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Strategy 2: Extract balanced outer JSON slice
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
    const subSlice = cleanJsonString(cleaned.slice(sliceStart, sliceEnd + 1));
    try {
      return JSON.parse(subSlice);
    } catch {}
  }

  // Strategy 3: Truncated JSON structural auto-repair
  const repaired = repairTruncatedJson(cleaned);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch {}
  }

  // Strategy 4: Extract all individual valid objects
  const recoveredObjects = extractAllCompleteObjects(cleaned);
  if (recoveredObjects.length > 0) {
    return {
      entries: recoveredObjects,
      exams: recoveredObjects,
      deadlines: recoveredObjects,
      classes: recoveredObjects,
      blocks: recoveredObjects,
    } as unknown as T;
  }

  // Strategy 5: Parse plain text / markdown response into structured items
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[*#\-\d\s.:>]+/, "").trim())
    .filter((l) => l.length >= 4 && !l.startsWith("{") && !l.startsWith("}") && !l.toLowerCase().includes("json"));

  if (lines.length > 0) {
    const textObjects = lines.slice(0, 10).map((line) => {
      const isNextClass = line.toLowerCase().includes("next class") || line.toLowerCase().includes("next lab");
      let explicitDueDate: string | null = null;
      let hasExplicitDate = false;

      const isoMatch = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (isoMatch) {
        explicitDueDate = isoMatch[0];
        hasExplicitDate = true;
      }

      return {
        taskName: line.slice(0, 100),
        subject: "Academic Notice",
        hasExplicitDate,
        explicitDueDate,
        explicitDueDayOfWeek: null,
        isRelativeClassMention: isNextClass,
        dueTime: null,
        importance: "MEDIUM",
        description: line,
        confidenceLevel: "MEDIUM",
        geminiReasoning: "Extracted from notice text.",
        sourceType: "CLASS_NOTICE",
        isDateAmbiguous: !hasExplicitDate && !isNextClass,
        ambiguityNote: hasExplicitDate || isNextClass ? null : "No explicit date specified in notice.",
        notes: null,
      };
    });

    return {
      deadlines: textObjects,
      entries: textObjects,
      exams: textObjects,
      blocks: textObjects,
    } as unknown as T;
  }

  throw new AIError({
    message: "Unable to parse structured schedule data from the model response.",
    code: "MALFORMED_OUTPUT",
    isRetryable: true,
  });
}

export function parseTimeString(raw: any): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  const m24 = str.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m24) {
    return `${m24[1].padStart(2, "0")}:${m24[2]}`;
  }
  const m12 = str.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (m12) {
    let hours = parseInt(m12[1], 10);
    const mins = m12[2] ? m12[2] : "00";
    const ampm = m12[3].toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${mins}`;
  }
  return null;
}

export function normalizeDayOfWeek(
  raw: any
): "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday" | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.startsWith("mon")) return "Monday";
  if (s.startsWith("tue")) return "Tuesday";
  if (s.startsWith("wed")) return "Wednesday";
  if (s.startsWith("thu")) return "Thursday";
  if (s.startsWith("fri")) return "Friday";
  if (s.startsWith("sat")) return "Saturday";
  if (s.startsWith("sun")) return "Sunday";
  return null;
}

const EMPTY_SLOT_IDENTIFIERS = new Set([
  "-", "--", "---", "nil", "null", "none", "empty", "free", "recess", "break",
  "lunch", "lunch break", "tea", "tea break", "off", "holiday", "no class", "n/a", "na"
]);

function cleanNullishString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (
    !str ||
    str === "null" ||
    str === "undefined" ||
    str === "nullish" ||
    str === "N/A" ||
    str === "none" ||
    str === "nil"
  ) {
    return null;
  }
  return str;
}

/**
 * Validates and sanitizes timetable entries extracted by the AI.
 * Handles grouped days, flat lists, or nested entries objects.
 */
export function validateExtractedTimetable(data: any): ExtractedTimetableEntry[] {
  let itemsArray: any[] = [];

  if (Array.isArray(data)) {
    itemsArray = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.entries)) {
      itemsArray = data.entries;
    } else if (Array.isArray(data.classes)) {
      itemsArray = data.classes;
    } else if (Array.isArray(data.timetable)) {
      itemsArray = data.timetable;
    } else if (Array.isArray(data.schedule)) {
      itemsArray = data.schedule;
    } else if (Array.isArray(data.data)) {
      itemsArray = data.data;
    } else {
      // Check if data is an object with days as keys (e.g. { Monday: [...], Tuesday: [...] })
      for (const dayKey of VALID_DAYS) {
        if (Array.isArray((data as any)[dayKey])) {
          for (const slot of (data as any)[dayKey]) {
            if (slot && typeof slot === "object") {
              itemsArray.push({ ...slot, day: dayKey });
            }
          }
        }
      }
      if (data.days && typeof data.days === "object") {
        for (const dayKey of VALID_DAYS) {
          if (Array.isArray((data.days as any)[dayKey])) {
            for (const slot of (data.days as any)[dayKey]) {
              if (slot && typeof slot === "object") {
                itemsArray.push({ ...slot, day: dayKey });
              }
            }
          }
        }
      }
    }
  }

  if (!Array.isArray(itemsArray) || itemsArray.length === 0) {
    // If no items found, return empty array (do not crash, will be reported cleanly)
    return [];
  }

  const validated: ExtractedTimetableEntry[] = [];

  for (const item of itemsArray) {
    if (!item || typeof item !== "object") continue;

    const rawSubject = String(item.subject || item.course || item.title || item.name || "").trim();
    if (!rawSubject || EMPTY_SLOT_IDENTIFIERS.has(rawSubject.toLowerCase())) {
      continue;
    }

    const day = normalizeDayOfWeek(item.day || item.dayOfWeek);
    if (!day) {
      continue;
    }

    let startTime = parseTimeString(item.startTime || item.start || item.time);
    let endTime = parseTimeString(item.endTime || item.end);

    let isUncertain = Boolean(item.isUncertain);
    if (!startTime) {
      startTime = "09:00";
      isUncertain = true;
    }

    if (!endTime) {
      const [h, m] = startTime.split(":").map(Number);
      const endH = Math.min(23, h + 1).toString().padStart(2, "0");
      endTime = `${endH}:${m.toString().padStart(2, "0")}`;
      isUncertain = true;
    } else if (startTime >= endTime) {
      const [h, m] = startTime.split(":").map(Number);
      const endH = Math.min(23, h + 1).toString().padStart(2, "0");
      endTime = `${endH}:${m.toString().padStart(2, "0")}`;
    }

    const subjectCode = cleanNullishString(item.subjectCode);
    const faculty = cleanNullishString(item.faculty || item.instructor || item.teacher);
    const room = cleanNullishString(item.room || item.lab || item.hall);
    const section = cleanNullishString(item.section || item.batch);

    let confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
    if (item.confidenceLevel && VALID_CONFIDENCE.includes(item.confidenceLevel.toUpperCase() as any)) {
      confidenceLevel = item.confidenceLevel.toUpperCase() as any;
    } else if (isUncertain) {
      confidenceLevel = "MEDIUM";
    }

    const notes = item.notes ? String(item.notes).trim() : null;

    validated.push({
      day,
      startTime,
      endTime,
      subject: rawSubject,
      subjectCode,
      faculty,
      room,
      section,
      confidenceLevel,
      isUncertain,
      notes,
    });
  }

  return validated;
}

/**
 * Validates and sanitizes exam timetable entries extracted by the AI.
 */
export function validateExtractedExams(data: any): ExtractedExamEntry[] {
  let examsArray: any[] = [];

  if (Array.isArray(data)) {
    examsArray = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.exams)) {
      examsArray = data.exams;
    } else if (Array.isArray(data.examSchedule)) {
      examsArray = data.examSchedule;
    } else if (Array.isArray(data.timetable)) {
      examsArray = data.timetable;
    } else if (Array.isArray(data.schedule)) {
      examsArray = data.schedule;
    } else if (Array.isArray(data.tests)) {
      examsArray = data.tests;
    } else if (Array.isArray(data.data)) {
      examsArray = data.data;
    }
  }

  if (!Array.isArray(examsArray) || examsArray.length === 0) {
    return [];
  }

  const validated: ExtractedExamEntry[] = [];

  for (const item of examsArray) {
    if (!item || typeof item !== "object") continue;

    const rawSubject = String(item.subject || item.examName || item.course || item.title || "").trim();
    if (!rawSubject || EMPTY_SLOT_IDENTIFIERS.has(rawSubject.toLowerCase())) {
      continue;
    }

    let examDate: string | null = null;
    let isDateAmbiguous = Boolean(item.isDateAmbiguous);

    if (item.examDate || item.date) {
      const rawDate = String(item.examDate || item.date).trim();
      const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        examDate = rawDate;
      } else {
        const dmyMatch = rawDate.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
        if (dmyMatch) {
          const day = dmyMatch[1].padStart(2, "0");
          const month = dmyMatch[2].padStart(2, "0");
          const year = dmyMatch[3];
          examDate = `${year}-${month}-${day}`;
        } else {
          const timestamp = Date.parse(rawDate);
          if (!isNaN(timestamp)) {
            const d = new Date(timestamp);
            examDate = d.toISOString().split("T")[0];
          } else {
            isDateAmbiguous = true;
          }
        }
      }
    } else {
      isDateAmbiguous = true;
    }

    const startTime = parseTimeString(item.startTime || item.start || item.time);
    let endTime = parseTimeString(item.endTime || item.end);
    if (startTime && endTime && startTime >= endTime) {
      endTime = null;
    }

    let examType: "Internal" | "Lab" | "SEE" | "Quiz" | "Practical" | "Other" = "Internal";
    if (item.examType) {
      const s = String(item.examType).trim().toLowerCase();
      if (s.includes("see") || s.includes("semester") || s.includes("final") || s.includes("end sem")) {
        examType = "SEE";
      } else if (s.includes("lab")) {
        examType = "Lab";
      } else if (s.includes("quiz") || s.includes("test")) {
        examType = "Quiz";
      } else if (s.includes("intern") || s.includes("mid") || s.includes("cie") || s.includes("unit")) {
        examType = "Internal";
      } else if (s.includes("practical")) {
        examType = "Practical";
      } else {
        examType = "Other";
      }
    }

    const subjectCode = cleanNullishString(item.subjectCode);
    const room = cleanNullishString(item.room || item.hall);
    const semesterBranch = cleanNullishString(item.semesterBranch || item.branch || item.semester);
    const notes = cleanNullishString(item.notes);

    let confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
    if (item.confidenceLevel && VALID_CONFIDENCE.includes(String(item.confidenceLevel).toUpperCase() as any)) {
      confidenceLevel = String(item.confidenceLevel).toUpperCase() as any;
    } else if (isDateAmbiguous || !startTime) {
      confidenceLevel = "MEDIUM";
    }

    const ambiguityNote = isDateAmbiguous
      ? cleanNullishString(item.ambiguityNote) || "Exact exam date could not be determined with certainty."
      : null;

    validated.push({
      subject: rawSubject,
      subjectCode,
      examDate,
      startTime,
      endTime,
      examType,
      room,
      semesterBranch,
      confidenceLevel,
      isDateAmbiguous,
      ambiguityNote,
      notes,
    });
  }

  return validated;
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
    } else if (Array.isArray(data.assignments)) {
      list = data.assignments;
    } else if (Array.isArray(data.data)) {
      list = data.data;
    }
  }

  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const validated: ExtractedDeadline[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;

    const taskName = String(item.taskName || item.title || item.name || "").trim();
    if (!taskName) continue;

    const subject = String(item.subject || item.course || "Coursework").trim();

    let explicitDueDate: string | null = null;
    let hasExplicitDate = Boolean(item.hasExplicitDate);

    if (item.explicitDueDate && typeof item.explicitDueDate === "string") {
      const trimmedDate = item.explicitDueDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        explicitDueDate = trimmedDate;
        hasExplicitDate = true;
      }
    }

    let explicitDueDayOfWeek: string | null = null;
    if (item.explicitDueDayOfWeek && typeof item.explicitDueDayOfWeek === "string") {
      const normalizedDay = item.explicitDueDayOfWeek.trim().toLowerCase();
      const matchedDay = VALID_DAYS.find((d) => d.toLowerCase() === normalizedDay);
      if (matchedDay) {
        explicitDueDayOfWeek = matchedDay;
      }
    }

    let dueTime: string | null = null;
    if (item.dueTime && typeof item.dueTime === "string") {
      dueTime = parseTimeString(item.dueTime);
    }

    let importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (item.importance && typeof item.importance === "string") {
      const normalizedImp = item.importance.trim().toUpperCase();
      if (VALID_IMPORTANCE.includes(normalizedImp as any)) {
        importance = normalizedImp as any;
      }
    }

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

    const VALID_SOURCE_TYPES = ["SYLLABUS", "CANVAS", "EMAIL", "ASSIGNMENT", "CLASS_NOTICE", "OTHER"] as const;
    let sourceType: "SYLLABUS" | "CANVAS" | "EMAIL" | "ASSIGNMENT" | "CLASS_NOTICE" | "OTHER" = "CLASS_NOTICE";
    if (item.sourceType && typeof item.sourceType === "string") {
      const normalizedSource = item.sourceType.trim().toUpperCase();
      if (VALID_SOURCE_TYPES.includes(normalizedSource as any)) {
        sourceType = normalizedSource as any;
      }
    }

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

  if (!Array.isArray(blocksArray) || blocksArray.length === 0) {
    return [];
  }

  const validated: GeneratedScheduleBlock[] = [];

  for (let i = 0; i < blocksArray.length; i++) {
    const b = blocksArray[i];
    if (!b || typeof b !== "object") continue;

    const activity = String(b.activity || b.title || b.name || "Focus Session").trim();
    const startTimeRaw = parseTimeString(b.startTime);
    const endTimeRaw = parseTimeString(b.endTime);

    if (!startTimeRaw || !endTimeRaw) continue;

    let type: ScheduleBlockType = "task";
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
    
    // Automatically infer isAiRecommendation if marked or if type is an AI suggestion type (revision, skill, review, organize)
    const isAiRecommendation = Boolean(
      b.isAiRecommendation ||
      type === "revision" ||
      type === "skill" ||
      type === "review" ||
      type === "organize" ||
      (!deadlineId && type === "task" && !b.id?.startsWith("class-") && !b.id?.startsWith("event-"))
    );

    validated.push({
      id,
      startTime: startTimeRaw,
      endTime: endTimeRaw,
      activity,
      type,
      priority,
      deadlineId,
      subject,
      reason,
      location,
      isAiRecommendation,
    });
  }

  return validated;
}
