var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/ai/types.ts
var AIError;
var init_types = __esm({
  "server/ai/types.ts"() {
    "use strict";
    AIError = class extends Error {
      code;
      provider;
      status;
      isRetryable;
      constructor(options) {
        super(options.message);
        this.name = "AIError";
        this.code = options.code;
        this.provider = options.provider;
        this.status = options.status;
        this.isRetryable = options.isRetryable ?? (options.code === "RATE_LIMIT" || options.code === "TIMEOUT" || options.code === "PROVIDER_UNAVAILABLE");
        if (options.cause) {
          this.cause = options.cause;
        }
      }
    };
  }
});

// server/ai/validator.ts
function cleanJsonString(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
    cleaned = cleaned.replace(/\n?```\s*$/i, "");
    cleaned = cleaned.trim();
  }
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*(?:```|$)/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  return cleaned.trim();
}
function repairTruncatedJson(str) {
  let text = cleanJsonString(str);
  if (!text) return "";
  try {
    JSON.parse(text);
    return text;
  } catch {
  }
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let startIdx = 0;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }
  text = text.slice(startIdx);
  const lastCloseBrace = text.lastIndexOf("}");
  if (lastCloseBrace !== -1) {
    let candidate = text.slice(0, lastCloseBrace + 1);
    candidate = candidate.replace(/,\s*$/, "");
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
    } catch {
    }
  }
  return text;
}
function extractAllCompleteObjects(text) {
  const objects = [];
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
          } catch {
          }
          startIdx = -1;
        }
      }
    }
  }
  return objects;
}
function safeParseJson(rawText) {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    throw new AIError({
      message: "Model returned an empty response. Please try again or paste the text directly.",
      code: "MALFORMED_OUTPUT",
      isRetryable: true
    });
  }
  const cleaned = cleanJsonString(rawText);
  try {
    return JSON.parse(cleaned);
  } catch {
  }
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
    } catch {
    }
  }
  const repaired = repairTruncatedJson(cleaned);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch {
    }
  }
  const recoveredObjects = extractAllCompleteObjects(cleaned);
  if (recoveredObjects.length > 0) {
    return {
      entries: recoveredObjects,
      exams: recoveredObjects,
      deadlines: recoveredObjects,
      classes: recoveredObjects,
      blocks: recoveredObjects
    };
  }
  const lines = rawText.split(/\r?\n/).map((l) => l.trim().replace(/^[*#\-\d\s.:>]+/, "").trim()).filter((l) => l.length >= 4 && !l.startsWith("{") && !l.startsWith("}") && !l.toLowerCase().includes("json"));
  if (lines.length > 0) {
    const textObjects = lines.slice(0, 10).map((line) => {
      const isNextClass = line.toLowerCase().includes("next class") || line.toLowerCase().includes("next lab");
      let explicitDueDate = null;
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
        notes: null
      };
    });
    return {
      deadlines: textObjects,
      entries: textObjects,
      exams: textObjects,
      blocks: textObjects
    };
  }
  throw new AIError({
    message: "Unable to parse structured schedule data from the model response.",
    code: "MALFORMED_OUTPUT",
    isRetryable: true
  });
}
function parseTimeString(raw) {
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
function normalizeDayOfWeek(raw) {
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
function cleanNullishString(val) {
  if (val === null || val === void 0) return null;
  const str = String(val).trim();
  if (!str || str === "null" || str === "undefined" || str === "nullish" || str === "N/A" || str === "none" || str === "nil") {
    return null;
  }
  return str;
}
function validateExtractedTimetable(data) {
  let itemsArray = [];
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
      for (const dayKey of VALID_DAYS) {
        if (Array.isArray(data[dayKey])) {
          for (const slot of data[dayKey]) {
            if (slot && typeof slot === "object") {
              itemsArray.push({ ...slot, day: dayKey });
            }
          }
        }
      }
      if (data.days && typeof data.days === "object") {
        for (const dayKey of VALID_DAYS) {
          if (Array.isArray(data.days[dayKey])) {
            for (const slot of data.days[dayKey]) {
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
    return [];
  }
  const validated = [];
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
    let confidenceLevel = "HIGH";
    if (item.confidenceLevel && VALID_CONFIDENCE.includes(item.confidenceLevel.toUpperCase())) {
      confidenceLevel = item.confidenceLevel.toUpperCase();
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
      notes
    });
  }
  return validated;
}
function validateExtractedExams(data) {
  let examsArray = [];
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
  const validated = [];
  for (const item of examsArray) {
    if (!item || typeof item !== "object") continue;
    const rawSubject = String(item.subject || item.examName || item.course || item.title || "").trim();
    if (!rawSubject || EMPTY_SLOT_IDENTIFIERS.has(rawSubject.toLowerCase())) {
      continue;
    }
    let examDate = null;
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
    let examType = "Internal";
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
    let confidenceLevel = "HIGH";
    if (item.confidenceLevel && VALID_CONFIDENCE.includes(String(item.confidenceLevel).toUpperCase())) {
      confidenceLevel = String(item.confidenceLevel).toUpperCase();
    } else if (isDateAmbiguous || !startTime) {
      confidenceLevel = "MEDIUM";
    }
    const ambiguityNote = isDateAmbiguous ? cleanNullishString(item.ambiguityNote) || "Exact exam date could not be determined with certainty." : null;
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
      notes
    });
  }
  return validated;
}
function validateExtractedDeadlines(data) {
  let list = [];
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
  const validated = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const taskName = String(item.taskName || item.title || item.name || "").trim();
    if (!taskName) continue;
    const subject = String(item.subject || item.course || "Coursework").trim();
    let explicitDueDate = null;
    let hasExplicitDate = Boolean(item.hasExplicitDate);
    if (item.explicitDueDate && typeof item.explicitDueDate === "string") {
      const trimmedDate = item.explicitDueDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        explicitDueDate = trimmedDate;
        hasExplicitDate = true;
      }
    }
    let explicitDueDayOfWeek = null;
    if (item.explicitDueDayOfWeek && typeof item.explicitDueDayOfWeek === "string") {
      const normalizedDay = item.explicitDueDayOfWeek.trim().toLowerCase();
      const matchedDay = VALID_DAYS.find((d) => d.toLowerCase() === normalizedDay);
      if (matchedDay) {
        explicitDueDayOfWeek = matchedDay;
      }
    }
    let dueTime = null;
    if (item.dueTime && typeof item.dueTime === "string") {
      dueTime = parseTimeString(item.dueTime);
    }
    let importance = "MEDIUM";
    if (item.importance && typeof item.importance === "string") {
      const normalizedImp = item.importance.trim().toUpperCase();
      if (VALID_IMPORTANCE.includes(normalizedImp)) {
        importance = normalizedImp;
      }
    }
    let confidenceLevel = "MEDIUM";
    if (item.confidenceLevel && typeof item.confidenceLevel === "string") {
      const normalizedConf = item.confidenceLevel.trim().toUpperCase();
      if (VALID_CONFIDENCE.includes(normalizedConf)) {
        confidenceLevel = normalizedConf;
      }
    }
    const description = String(item.description || item.summary || "").trim();
    const geminiReasoning = String(
      item.geminiReasoning || item.reasoning || item.explanation || "Extracted from academic notice."
    ).trim();
    const VALID_SOURCE_TYPES = ["SYLLABUS", "CANVAS", "EMAIL", "ASSIGNMENT", "CLASS_NOTICE", "OTHER"];
    let sourceType = "CLASS_NOTICE";
    if (item.sourceType && typeof item.sourceType === "string") {
      const normalizedSource = item.sourceType.trim().toUpperCase();
      if (VALID_SOURCE_TYPES.includes(normalizedSource)) {
        sourceType = normalizedSource;
      }
    }
    const isDateAmbiguous = Boolean(
      item.isDateAmbiguous || !hasExplicitDate && !item.isRelativeClassMention || item.ambiguityNote && String(item.ambiguityNote).trim().length > 0
    );
    const ambiguityNote = item.ambiguityNote ? String(item.ambiguityNote).trim() : !hasExplicitDate && !item.isRelativeClassMention ? "No explicit calendar date was specified in this notice." : null;
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
      notes
    });
  }
  return validated;
}
function validateScheduleBlocks(data) {
  let blocksArray = [];
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
  const validated = [];
  for (let i = 0; i < blocksArray.length; i++) {
    const b = blocksArray[i];
    if (!b || typeof b !== "object") continue;
    const activity = String(b.activity || b.title || b.name || "Focus Session").trim();
    const startTimeRaw = parseTimeString(b.startTime);
    const endTimeRaw = parseTimeString(b.endTime);
    if (!startTimeRaw || !endTimeRaw) continue;
    let type = "task";
    if (b.type && typeof b.type === "string") {
      const normalizedType = b.type.trim().toLowerCase();
      if (VALID_BLOCK_TYPES.includes(normalizedType)) {
        type = normalizedType;
      }
    }
    let priority = void 0;
    if (b.priority && typeof b.priority === "string") {
      const normalizedPri = b.priority.trim().toUpperCase();
      if (VALID_IMPORTANCE.includes(normalizedPri)) {
        priority = normalizedPri;
      }
    }
    const id = b.id ? String(b.id).trim() : `block-${i + 1}-${Date.now()}`;
    const deadlineId = b.deadlineId ? String(b.deadlineId).trim() : void 0;
    const subject = b.subject ? String(b.subject).trim() : void 0;
    const reason = b.reason ? String(b.reason).trim() : void 0;
    const location = b.location ? String(b.location).trim() : void 0;
    const isAiRecommendation = Boolean(
      b.isAiRecommendation || type === "revision" || type === "skill" || type === "review" || type === "organize" || !deadlineId && type === "task" && !b.id?.startsWith("class-") && !b.id?.startsWith("event-")
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
      isAiRecommendation
    });
  }
  return validated;
}
var VALID_DAYS, VALID_IMPORTANCE, VALID_CONFIDENCE, VALID_BLOCK_TYPES, EMPTY_SLOT_IDENTIFIERS;
var init_validator = __esm({
  "server/ai/validator.ts"() {
    "use strict";
    init_types();
    VALID_DAYS = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ];
    VALID_IMPORTANCE = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    VALID_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"];
    VALID_BLOCK_TYPES = [
      "class",
      "task",
      "event",
      "break",
      "revision",
      "skill",
      "review",
      "organize"
    ];
    EMPTY_SLOT_IDENTIFIERS = /* @__PURE__ */ new Set([
      "-",
      "--",
      "---",
      "nil",
      "null",
      "none",
      "empty",
      "free",
      "recess",
      "break",
      "lunch",
      "lunch break",
      "tea",
      "tea break",
      "off",
      "holiday",
      "no class",
      "n/a",
      "na"
    ]);
  }
});

// server/ai/pdf-parser.ts
import zlib from "zlib";
async function getPdfParse() {
  if (pdfParseAttempted) return pdfParseFn;
  pdfParseAttempted = true;
  try {
    const mod = await import("pdf-parse");
    let fn = mod.default || mod;
    if (typeof fn !== "function" && fn && typeof fn.pdfParse === "function") {
      fn = fn.pdfParse;
    }
    if (typeof fn === "function") {
      pdfParseFn = fn;
    }
  } catch {
    pdfParseFn = null;
  }
  return pdfParseFn;
}
async function extractTextFromPdf(pdfBase64OrBuffer) {
  try {
    let buffer;
    if (typeof pdfBase64OrBuffer === "string") {
      let rawBase64 = pdfBase64OrBuffer;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }
      buffer = Buffer.from(rawBase64, "base64");
    } else {
      buffer = pdfBase64OrBuffer;
    }
    if (!buffer || buffer.length === 0) {
      return "";
    }
    const parser = await getPdfParse();
    if (parser && typeof parser === "function") {
      try {
        const data = await parser(buffer, { max: 15 });
        if (data && typeof data.text === "string" && data.text.trim().length > 0) {
          return cleanPdfText(data.text);
        }
      } catch (parseErr) {
        console.warn("[PDF Parser] pdf-parse call failed, switching to native stream extractor:", parseErr);
      }
    }
    const streamFallbackText = extractFromPdfStreamBinary(buffer);
    if (streamFallbackText.trim()) {
      return cleanPdfText(streamFallbackText);
    }
    return "";
  } catch (err) {
    console.warn("[PDF Parser] Failed to extract text from PDF:", err);
    return "";
  }
}
function cleanPdfText(rawText, maxLength = 8e3) {
  if (!rawText) return "";
  let cleaned = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t+/g, " ").replace(/[ ]{2,}/g, " ").replace(/^[ ]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + "\n\n[... content truncated to stay within token limits ...]";
  }
  return cleaned;
}
function extractFromPdfStreamBinary(buffer) {
  try {
    const textChunks = [];
    const binaryString = buffer.toString("binary");
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match;
    while ((match = streamRegex.exec(binaryString)) !== null) {
      const streamContent = match[1];
      try {
        const streamBuffer = Buffer.from(streamContent, "binary");
        let decompressed = null;
        try {
          decompressed = zlib.inflateSync(streamBuffer);
        } catch {
          try {
            decompressed = zlib.inflateRawSync(streamBuffer);
          } catch {
          }
        }
        if (decompressed) {
          const streamText = decompressed.toString("utf-8");
          const extracted = parsePdfStreamText(streamText);
          if (extracted.trim()) {
            textChunks.push(extracted);
          }
        }
      } catch {
      }
    }
    const uncompressed = parsePdfStreamText(binaryString);
    if (uncompressed.trim()) {
      textChunks.push(uncompressed);
    }
    return textChunks.join("\n").trim();
  } catch {
    return "";
  }
}
function parsePdfStreamText(stream) {
  const lines = [];
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let match;
  while ((match = tjRegex.exec(stream)) !== null) {
    if (match[1]) {
      lines.push(unescapePdfString(match[1]));
    }
  }
  const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(stream)) !== null) {
    const arrayContent = match[1];
    const subTjRegex = /\(([^)]*)\)/g;
    let subMatch;
    let combined = "";
    while ((subMatch = subTjRegex.exec(arrayContent)) !== null) {
      combined += unescapePdfString(subMatch[1]);
    }
    if (combined.trim()) {
      lines.push(combined);
    }
  }
  const quoteRegex = /\(([^)]*)\)\s*['"]/g;
  while ((match = quoteRegex.exec(stream)) !== null) {
    if (match[1]) {
      lines.push(unescapePdfString(match[1]));
    }
  }
  return lines.join(" ");
}
function unescapePdfString(str) {
  return str.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
}
var pdfParseFn, pdfParseAttempted;
var init_pdf_parser = __esm({
  "server/ai/pdf-parser.ts"() {
    "use strict";
    pdfParseFn = null;
    pdfParseAttempted = false;
  }
});

// server/ai/gemini-adapter.ts
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
function getGeminiApiKey() {
  let key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key || key === "MY_GEMINI_API_KEY") {
    const candidateFiles = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), ".env.development.local")
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
      } catch {
      }
    }
  }
  if (!key || key === "MY_GEMINI_API_KEY") {
    return "";
  }
  return key;
}
function formatGeminiError(err) {
  if (err instanceof AIError) return err;
  const rawMsg = err?.message || String(err || "");
  let parsedJson = null;
  try {
    if (typeof rawMsg === "string" && rawMsg.trim().startsWith("{")) {
      parsedJson = JSON.parse(rawMsg);
    }
  } catch {
  }
  const errorObj = parsedJson?.error || err?.error || err;
  const status = errorObj?.status || err?.status || "";
  const code = errorObj?.code || err?.code;
  const message = (errorObj?.message || rawMsg || "").toString();
  if (message.includes("API key not valid") || message.includes("API_KEY_INVALID") || status === "UNAUTHENTICATED" || code === 401 || code === 400 && message.toLowerCase().includes("api key")) {
    return new AIError({
      message: "Gemini API authentication failed: The provided GEMINI_API_KEY is invalid.",
      code: "AUTHENTICATION_FAILED",
      provider: "gemini",
      status: 401,
      isRetryable: false,
      cause: err
    });
  }
  if (status === "RESOURCE_EXHAUSTED" || code === 429 || message.includes("quota") || message.includes("Resource has been exhausted") || message.includes("rate limit")) {
    return new AIError({
      message: "Gemini API rate limit or quota exceeded.",
      code: "RATE_LIMIT",
      provider: "gemini",
      status: 429,
      isRetryable: true,
      cause: err
    });
  }
  if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("timed out") || code === 504 || status === "DEADLINE_EXCEEDED") {
    return new AIError({
      message: "Gemini API request timed out.",
      code: "TIMEOUT",
      provider: "gemini",
      status: 504,
      isRetryable: true,
      cause: err
    });
  }
  if (message.includes("JSON") || message.includes("SyntaxError") || message.includes("Unexpected end") || message.includes("Unexpected token")) {
    return new AIError({
      message: "Model response format was incomplete. Retrying with fallback...",
      code: "MALFORMED_OUTPUT",
      provider: "gemini",
      isRetryable: true,
      cause: err
    });
  }
  if (status === "NOT_FOUND" || status === "UNAVAILABLE" || code === 503 || code === 404 || message.includes("not found")) {
    return new AIError({
      message: "Gemini service or model is temporarily unavailable.",
      code: "PROVIDER_UNAVAILABLE",
      provider: "gemini",
      status: typeof code === "number" ? code : 503,
      isRetryable: true,
      cause: err
    });
  }
  return new AIError({
    message: message.length < 200 ? message : "Error communicating with Gemini service.",
    code: "UNKNOWN",
    provider: "gemini",
    isRetryable: true,
    cause: err
  });
}
async function withTimeout(promise, timeoutMs, operationDesc) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new AIError({
          message: `Gemini ${operationDesc} timed out after ${timeoutMs / 1e3}s.`,
          code: "TIMEOUT",
          provider: "gemini",
          isRetryable: true
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
var CANDIDATE_MODELS, REQUEST_TIMEOUT_MS, GeminiProviderAdapter;
var init_gemini_adapter = __esm({
  "server/ai/gemini-adapter.ts"() {
    "use strict";
    init_types();
    init_validator();
    init_pdf_parser();
    CANDIDATE_MODELS = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ];
    REQUEST_TIMEOUT_MS = 25e3;
    GeminiProviderAdapter = class {
      name = "gemini";
      isAvailable() {
        return Boolean(getGeminiApiKey());
      }
      async extractDeadlines(payload) {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          throw new AIError({
            message: "GEMINI_API_KEY environment variable is not configured.",
            code: "MISSING_API_KEY",
            provider: "gemini",
            isRetryable: false
          });
        }
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
        const currentDate = payload.currentDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
        const contents = [];
        let extractedPdfText = "";
        let isTextBasedPdf = false;
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
          if (!isTextBasedPdf) {
            contents.push({
              inlineData: {
                data: rawBase64,
                mimeType: mime
              }
            });
          }
        }
        let textPrompt = payload.text ? `ACADEMIC NOTICE TEXT:
${payload.text.trim()}` : "";
        if (extractedPdfText) {
          textPrompt += `

EXTRACTED DOCUMENT TEXT:
${extractedPdfText.slice(0, 8e3)}`;
        }
        if (payload.file?.name) {
          textPrompt += `
(Source Document Name: ${payload.file.name})`;
        }
        textPrompt += `

Analyze this academic notice thoroughly and extract all academic tasks in the requested JSON schema. If no explicit calendar date is present, do not invent one.`;
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
              notes: { type: Type.STRING, description: "Any special instructions or submission notes" }
            },
            required: [
              "taskName",
              "subject",
              "hasExplicitDate",
              "isRelativeClassMention",
              "importance",
              "description",
              "confidenceLevel",
              "geminiReasoning"
            ]
          }
        };
        let lastError = null;
        for (const model of CANDIDATE_MODELS) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction: systemPrompt,
                  responseMimeType: "application/json",
                  responseSchema
                }
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
              model
            };
          } catch (err) {
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
          provider: "gemini"
        });
      }
      async generatePlanMyDay(payload) {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          throw new AIError({
            message: "GEMINI_API_KEY environment variable is not configured.",
            code: "MISSING_API_KEY",
            provider: "gemini",
            isRetryable: false
          });
        }
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
        const {
          currentDate,
          currentTime,
          preferences,
          fixedCommitments,
          activeDeadlines,
          upcomingExams = [],
          completedTasks = [],
          userSubjects = []
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
                    enum: ["class", "task", "event", "break", "revision", "skill", "review", "organize"]
                  },
                  priority: { type: Type.STRING, enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
                  deadlineId: { type: Type.STRING, description: "Matching deadline id if type is task, else empty string" },
                  subject: { type: Type.STRING, description: "Subject or course name if applicable" },
                  reason: { type: Type.STRING, description: "Context-grounded rationale for scheduling" },
                  location: { type: Type.STRING, description: "Classroom or event location if provided" },
                  isAiRecommendation: { type: Type.BOOLEAN, description: "True if block is an AI-suggested recommendation" }
                },
                required: ["id", "startTime", "endTime", "activity", "type"]
              }
            }
          },
          required: ["blocks"]
        };
        let lastError = null;
        for (const model of CANDIDATE_MODELS) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents: [{ text: userPrompt }],
                config: {
                  systemInstruction: systemPrompt,
                  responseMimeType: "application/json",
                  responseSchema
                }
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
              model
            };
          } catch (err) {
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
          provider: "gemini"
        });
      }
      async extractTimetable(payload) {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          throw new AIError({
            message: "GEMINI_API_KEY environment variable is not configured.",
            code: "MISSING_API_KEY",
            provider: "gemini",
            isRetryable: false
          });
        }
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
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
        const contents = [];
        let extractedPdfText = "";
        let isTextBasedPdf = false;
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
          if (!isTextBasedPdf) {
            contents.push({
              inlineData: {
                data: rawBase64,
                mimeType: mime
              }
            });
          }
        }
        let textPrompt = payload.text ? `TIMETABLE TEXT / CONTEXT:
${payload.text.trim()}` : "";
        if (extractedPdfText) {
          textPrompt += `

EXTRACTED DOCUMENT TEXT LAYER:
${extractedPdfText.slice(0, 8e3)}`;
        }
        if (payload.file?.name) {
          textPrompt += `
(Source File: ${payload.file.name})`;
        }
        textPrompt += `

Analyze this timetable document thoroughly. Extract all weekly classes into the structured JSON schema.`;
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
                    enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
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
                  notes: { type: Type.STRING }
                },
                required: ["day", "startTime", "endTime", "subject"]
              }
            }
          },
          required: ["entries"]
        };
        let lastError = null;
        for (const model of CANDIDATE_MODELS) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction: systemPrompt,
                  responseMimeType: "application/json",
                  responseSchema
                }
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
              model
            };
          } catch (err) {
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
          provider: "gemini"
        });
      }
      async extractExams(payload) {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          throw new AIError({
            message: "GEMINI_API_KEY environment variable is not configured.",
            code: "MISSING_API_KEY",
            provider: "gemini",
            isRetryable: false
          });
        }
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
        const currentDate = payload.currentDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
        const contents = [];
        let extractedPdfText = "";
        let isTextBasedPdf = false;
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
          if (!isTextBasedPdf) {
            contents.push({
              inlineData: {
                data: rawBase64,
                mimeType: mime
              }
            });
          }
        }
        let textPrompt = payload.text ? `EXAM TIMETABLE / DATE SHEET TEXT:
${payload.text.trim()}` : "";
        if (extractedPdfText) {
          textPrompt += `

EXTRACTED DOCUMENT TEXT LAYER:
${extractedPdfText.slice(0, 8e3)}`;
        }
        if (payload.file?.name) {
          textPrompt += `
(Source File: ${payload.file.name})`;
        }
        textPrompt += `

Analyze this exam timetable carefully. Extract all exam schedule entries into the structured JSON schema.`;
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
                    enum: ["Internal", "Lab", "SEE", "Quiz", "Practical", "Other"]
                  },
                  room: { type: Type.STRING, description: "Exam hall or room" },
                  semesterBranch: { type: Type.STRING, description: "Semester or department info" },
                  confidenceLevel: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
                  isDateAmbiguous: { type: Type.BOOLEAN },
                  ambiguityNote: { type: Type.STRING },
                  notes: { type: Type.STRING }
                },
                required: ["subject"]
              }
            }
          },
          required: ["exams"]
        };
        let lastError = null;
        for (const model of CANDIDATE_MODELS) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction: systemPrompt,
                  responseMimeType: "application/json",
                  responseSchema
                }
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
              model
            };
          } catch (err) {
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
          provider: "gemini"
        });
      }
    };
  }
});

// server/ai/openrouter-adapter.ts
import fs2 from "fs";
import path2 from "path";
function getOpenRouterApiKey() {
  let key = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!key) {
    const candidateFiles = [
      path2.resolve(process.cwd(), ".env.local"),
      path2.resolve(process.cwd(), ".env"),
      path2.resolve(process.cwd(), ".env.development.local")
    ];
    for (const filePath of candidateFiles) {
      try {
        if (fs2.existsSync(filePath)) {
          const content = fs2.readFileSync(filePath, "utf-8");
          const match = content.match(/OPENROUTER_API_KEY=([^\r\n]+)/);
          if (match && match[1]) {
            const candidateKey = match[1].trim();
            if (candidateKey) {
              key = candidateKey;
              break;
            }
          }
        }
      } catch {
      }
    }
  }
  if (!key) {
    const rawGemini = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (rawGemini && !rawGemini.startsWith("AIza") && rawGemini !== "MY_GEMINI_API_KEY") {
      key = rawGemini;
    }
  }
  return key;
}
function formatOpenRouterError(err, status) {
  if (err instanceof AIError) return err;
  const rawMsg = err?.message || String(err || "");
  const statusCode = status || err?.status || err?.statusCode;
  const lowerMsg = rawMsg.toLowerCase();
  if (statusCode === 401 || lowerMsg.includes("unauthorized") || lowerMsg.includes("api key") || lowerMsg.includes("invalid credentials")) {
    return new AIError({
      message: "OpenRouter authentication failed: The provided OPENROUTER_API_KEY is invalid.",
      code: "AUTHENTICATION_FAILED",
      provider: "openrouter",
      status: 401,
      isRetryable: false,
      cause: err
    });
  }
  if (statusCode === 429 || lowerMsg.includes("rate limit") || lowerMsg.includes("quota") || lowerMsg.includes("too many requests")) {
    return new AIError({
      message: "OpenRouter rate limit reached on model. Switching to fallback model...",
      code: "RATE_LIMIT",
      provider: "openrouter",
      status: 429,
      isRetryable: true,
      cause: err
    });
  }
  if (lowerMsg.includes("timeout") || lowerMsg.includes("timed out") || lowerMsg.includes("abort") || statusCode === 504 || statusCode === 408) {
    return new AIError({
      message: "OpenRouter request timed out.",
      code: "TIMEOUT",
      provider: "openrouter",
      status: 504,
      isRetryable: true,
      cause: err
    });
  }
  if (statusCode === 503 || statusCode === 502 || statusCode === 404 || lowerMsg.includes("busy") || lowerMsg.includes("no endpoints found") || lowerMsg.includes("temporarily unavailable") || lowerMsg.includes("overloaded")) {
    return new AIError({
      message: "OpenRouter model is temporarily busy. Switching to fallback model...",
      code: "PROVIDER_UNAVAILABLE",
      provider: "openrouter",
      status: statusCode || 503,
      isRetryable: true,
      cause: err
    });
  }
  if (lowerMsg.includes("json") || lowerMsg.includes("syntaxerror") || lowerMsg.includes("unexpected end") || lowerMsg.includes("malformed")) {
    return new AIError({
      message: "OpenRouter model returned malformed output.",
      code: "MALFORMED_OUTPUT",
      provider: "openrouter",
      isRetryable: true,
      cause: err
    });
  }
  return new AIError({
    message: rawMsg.length < 200 ? rawMsg : "Error communicating with OpenRouter service.",
    code: "UNKNOWN",
    provider: "openrouter",
    isRetryable: true,
    cause: err
  });
}
var OPENROUTER_ENDPOINT, OPENROUTER_TEXT_MODELS, OPENROUTER_VISION_MODELS, REQUEST_TIMEOUT_MS2, OpenRouterProviderAdapter;
var init_openrouter_adapter = __esm({
  "server/ai/openrouter-adapter.ts"() {
    "use strict";
    init_types();
    init_validator();
    init_pdf_parser();
    OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
    OPENROUTER_TEXT_MODELS = [
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.3-70b-instruct",
      "mistralai/mistral-small-24b-instruct-2501",
      "deepseek/deepseek-chat",
      "qwen/qwen-2.5-72b-instruct",
      "openrouter/free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "mistralai/mistral-small-24b-instruct-2501:free",
      "qwen/qwen-2.5-72b-instruct:free"
    ];
    OPENROUTER_VISION_MODELS = [
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.2-11b-vision-instruct",
      "openrouter/free",
      "meta-llama/llama-3.2-11b-vision-instruct:free"
    ];
    REQUEST_TIMEOUT_MS2 = 15e3;
    OpenRouterProviderAdapter = class {
      name = "openrouter";
      isAvailable() {
        return Boolean(getOpenRouterApiKey());
      }
      async callOpenRouterWithFallback(messages, candidateModels, schemaInstruction) {
        const apiKey = getOpenRouterApiKey();
        if (!apiKey) {
          throw new AIError({
            message: "OPENROUTER_API_KEY environment variable is not configured.",
            code: "MISSING_API_KEY",
            provider: "openrouter",
            isRetryable: false
          });
        }
        let lastError = null;
        for (const model of candidateModels) {
          const payloadsToTry = [
            {
              model,
              messages,
              temperature: 0.2,
              max_tokens: 3e3
            }
          ];
          if (model.includes("gemini") || model.includes("qwen") || model.includes("mistral")) {
            payloadsToTry.unshift({
              ...payloadsToTry[0],
              response_format: { type: "json_object" }
            });
          }
          for (const bodyPayload of payloadsToTry) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS2);
            try {
              const response = await fetch(OPENROUTER_ENDPOINT, {
                method: "POST",
                signal: controller.signal,
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "HTTP-Referer": "https://deadlineiq.internal",
                  "X-Title": "DeadlineIQ"
                },
                body: JSON.stringify(bodyPayload)
              });
              clearTimeout(timer);
              if (!response.ok) {
                const errText = await response.text();
                let parsedError = null;
                try {
                  parsedError = JSON.parse(errText);
                } catch {
                }
                const errorMsg = parsedError?.error?.message || parsedError?.message || `OpenRouter HTTP ${response.status}: ${errText.slice(0, 150)}`;
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
                  isRetryable: true
                });
              }
              return { text: content.trim(), model };
            } catch (err) {
              clearTimeout(timer);
              const formatted = formatOpenRouterError(err);
              lastError = formatted;
              if (formatted.code === "AUTHENTICATION_FAILED") {
                throw formatted;
              }
              if (bodyPayload.response_format && (formatted.status === 400 || formatted.status === 422)) {
                continue;
              }
              console.log(`[OpenRouter] Model ${model} unavailable, trying next candidate:`, formatted.message);
              break;
            }
          }
        }
        throw lastError || new AIError({
          message: "All OpenRouter models failed to respond.",
          code: "PROVIDER_UNAVAILABLE",
          provider: "openrouter"
        });
      }
      async extractDeadlines(payload) {
        const currentDate = payload.currentDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
        let userMessageContent;
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
                text: `Analyze this image notice for academic deadlines.
${payload.text || ""}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${rawBase64}`
                }
              }
            ];
          }
        }
        if (!userMessageContent) {
          let textBody = payload.text ? `NOTICE TEXT:
${payload.text.trim()}

` : "";
          if (extractedPdfText) {
            textBody += `EXTRACTED DOCUMENT TEXT:
${extractedPdfText.slice(0, 8e3)}

`;
          }
          if (payload.file?.name) {
            textBody += `Source File: ${payload.file.name}

`;
          }
          textBody += "Extract all academic deadlines into the required JSON object format.";
          userMessageContent = textBody;
        }
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent }
        ];
        const models = hasVisionInput ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
        const { text, model } = await this.callOpenRouterWithFallback(messages, models, "deadlines");
        const parsed = safeParseJson(text);
        const validated = validateExtractedDeadlines(parsed);
        return {
          data: validated,
          provider: "openrouter",
          model
        };
      }
      async generatePlanMyDay(payload) {
        const {
          currentDate,
          currentTime,
          preferences,
          fixedCommitments,
          activeDeadlines,
          upcomingExams = [],
          completedTasks = [],
          userSubjects = []
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
          { role: "user", content: userPrompt }
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
          model
        };
      }
      async extractTimetable(payload) {
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
        let userMessageContent;
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
                text: `Extract the weekly class timetable from this schedule image.
${payload.text || ""}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${rawBase64}`
                }
              }
            ];
          }
        }
        if (!userMessageContent) {
          let textBody = payload.text ? `TIMETABLE TEXT:
${payload.text.trim()}

` : "";
          if (extractedPdfText) {
            textBody += `EXTRACTED DOCUMENT TEXT LAYER:
${extractedPdfText.slice(0, 8e3)}

`;
          }
          if (payload.file?.name) {
            textBody += `Source File: ${payload.file.name}

`;
          }
          textBody += "Extract all weekly recurring class schedule entries into the required JSON format.";
          userMessageContent = textBody;
        }
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent }
        ];
        const models = hasVisionInput ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
        const { text, model } = await this.callOpenRouterWithFallback(messages, models, "entries");
        const parsed = safeParseJson(text);
        const validated = validateExtractedTimetable(parsed);
        return {
          data: validated,
          provider: "openrouter",
          model
        };
      }
      async extractExams(payload) {
        const currentDate = payload.currentDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
        let userMessageContent;
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
                text: `Extract all scheduled exams from this date sheet image.
${payload.text || ""}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${rawBase64}`
                }
              }
            ];
          }
        }
        if (!userMessageContent) {
          let textBody = payload.text ? `EXAM SCHEDULE TEXT:
${payload.text.trim()}

` : "";
          if (extractedPdfText) {
            textBody += `EXTRACTED DOCUMENT TEXT LAYER:
${extractedPdfText.slice(0, 8e3)}

`;
          }
          if (payload.file?.name) {
            textBody += `Source File: ${payload.file.name}

`;
          }
          textBody += "Extract all examination dates and times into the required JSON format.";
          userMessageContent = textBody;
        }
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent }
        ];
        const models = hasVisionInput ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
        const { text, model } = await this.callOpenRouterWithFallback(messages, models, "exams");
        const parsed = safeParseJson(text);
        const validated = validateExtractedExams(parsed);
        return {
          data: validated,
          provider: "openrouter",
          model
        };
      }
    };
  }
});

// server/ai/service.ts
var AIService, aiService;
var init_service = __esm({
  "server/ai/service.ts"() {
    "use strict";
    init_types();
    init_gemini_adapter();
    init_openrouter_adapter();
    AIService = class {
      adapters = /* @__PURE__ */ new Map();
      defaultOrder = ["gemini", "openrouter"];
      constructor() {
        this.registerAdapter(new GeminiProviderAdapter());
        this.registerAdapter(new OpenRouterProviderAdapter());
      }
      registerAdapter(adapter) {
        this.adapters.set(adapter.name, adapter);
      }
      getAdapter(provider) {
        return this.adapters.get(provider);
      }
      getAvailableProviders() {
        const available = [];
        this.adapters.forEach((adapter, name) => {
          if (adapter.isAvailable()) {
            available.push(name);
          }
        });
        return available;
      }
      /**
       * Sanitizes internal error into a clean, safe, human-readable user message.
       * Strips out keys, endpoints, stack traces, and internal metadata.
       */
      sanitizeErrorMessage(error) {
        if (error instanceof AIError) {
          switch (error.code) {
            case "MISSING_API_KEY":
              return "AI service is not configured. Please configure an API key in your environment.";
            case "AUTHENTICATION_FAILED":
              return "AI service authentication failed. Please verify your provider API key.";
            case "RATE_LIMIT":
              return "AI service is temporarily busy due to rate limits. Please wait a moment and try again.";
            case "TIMEOUT":
              return "AI request timed out. Please try again with a shorter document or simpler notice.";
            case "PROVIDER_UNAVAILABLE":
              return "AI service is temporarily unavailable. Please try again in a few moments.";
            case "MALFORMED_OUTPUT":
              return "The document analysis encountered an incomplete response. Please try again or paste the text directly.";
            case "UNSUPPORTED_INPUT":
              return "The uploaded file format is not supported for AI analysis.";
            default:
              break;
          }
        }
        const raw = String(error?.message || error || "");
        const lower = raw.toLowerCase();
        if (lower.includes("json") || lower.includes("syntaxerror") || lower.includes("unexpected end")) {
          return "The AI generated an incomplete response. Please try again or paste the schedule text directly.";
        }
        if (lower.includes("rate limit") || lower.includes("quota") || lower.includes("429")) {
          return "AI service is temporarily busy due to rate limits. Please wait a moment and try again.";
        }
        if (lower.includes("timeout") || lower.includes("timed out")) {
          return "AI request timed out. Please try again in a moment.";
        }
        if (lower.includes("unauthenticated") || lower.includes("api key") || lower.includes("401")) {
          return "AI service authentication failed. Please check your configuration.";
        }
        if (lower.includes("safety") || lower.includes("blocked")) {
          return "Notice analysis was flagged by safety filters. Please review the notice content.";
        }
        return "AI service is temporarily unavailable. Please try again or enter details manually.";
      }
      /**
       * Executes a task with automatic graceful fallback across registered providers.
       */
      async executeWithFallback(operationName, operation, preferredProvider) {
        const order = [];
        if (preferredProvider && this.adapters.has(preferredProvider)) {
          order.push(preferredProvider);
        }
        for (const p of this.defaultOrder) {
          if (!order.includes(p)) {
            order.push(p);
          }
        }
        const availableOrder = order.filter((p) => {
          const adapter = this.adapters.get(p);
          return adapter && adapter.isAvailable();
        });
        if (availableOrder.length === 0) {
          throw new AIError({
            message: "No AI provider is currently configured with valid credentials.",
            code: "MISSING_API_KEY",
            isRetryable: false
          });
        }
        const errors = [];
        for (const providerName of availableOrder) {
          const adapter = this.adapters.get(providerName);
          try {
            console.log(`[AIService] Attempting ${operationName} via provider: ${providerName}`);
            const result = await operation(adapter);
            console.log(`[AIService] ${operationName} succeeded using ${result.provider} (${result.model})`);
            return result;
          } catch (err) {
            console.log(`[AIService] Provider ${providerName} unavailable for ${operationName}, trying next provider:`, err?.message || err);
            errors.push({ provider: providerName, error: err });
            if (err instanceof AIError && !err.isRetryable && availableOrder.length === 1) {
              throw err;
            }
          }
        }
        const primaryError = errors[0]?.error;
        throw new AIError({
          message: `All AI providers failed for ${operationName}.`,
          code: primaryError instanceof AIError ? primaryError.code : "PROVIDER_UNAVAILABLE",
          cause: errors
        });
      }
      async extractDeadlines(payload, preferredProvider) {
        let chosenPreferred = preferredProvider;
        if (!chosenPreferred && payload.file?.mimeType?.toLowerCase().includes("pdf")) {
          chosenPreferred = "gemini";
        }
        return this.executeWithFallback(
          "extractDeadlines",
          (adapter) => adapter.extractDeadlines(payload),
          chosenPreferred
        );
      }
      async generatePlanMyDay(payload, preferredProvider) {
        return this.executeWithFallback(
          "generatePlanMyDay",
          (adapter) => adapter.generatePlanMyDay(payload),
          preferredProvider
        );
      }
      async extractTimetable(payload, preferredProvider) {
        let chosenPreferred = preferredProvider;
        if (!chosenPreferred && payload.file?.mimeType?.toLowerCase().includes("pdf")) {
          chosenPreferred = "gemini";
        }
        return this.executeWithFallback(
          "extractTimetable",
          async (adapter) => {
            if (!adapter.extractTimetable) {
              throw new AIError({
                message: `Provider ${adapter.name} does not support timetable extraction.`,
                code: "UNSUPPORTED_INPUT",
                provider: adapter.name,
                isRetryable: true
              });
            }
            return adapter.extractTimetable(payload);
          },
          chosenPreferred
        );
      }
      async extractExams(payload, preferredProvider) {
        let chosenPreferred = preferredProvider;
        if (!chosenPreferred && payload.file?.mimeType?.toLowerCase().includes("pdf")) {
          chosenPreferred = "gemini";
        }
        return this.executeWithFallback(
          "extractExams",
          async (adapter) => {
            if (!adapter.extractExams) {
              throw new AIError({
                message: `Provider ${adapter.name} does not support exam extraction.`,
                code: "UNSUPPORTED_INPUT",
                provider: adapter.name,
                isRetryable: true
              });
            }
            return adapter.extractExams(payload);
          },
          chosenPreferred
        );
      }
    };
    aiService = new AIService();
  }
});

// server/ai/index.ts
var init_ai = __esm({
  "server/ai/index.ts"() {
    "use strict";
    init_types();
    init_validator();
    init_gemini_adapter();
    init_openrouter_adapter();
    init_service();
  }
});

// server/accounts.ts
import fs3 from "node:fs";
import path3 from "node:path";
function persist() {
  try {
    const list = Array.from(accounts.values());
    fs3.writeFileSync(registryFile, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("Error persisting registry file:", err);
  }
}
function checkAccount(email) {
  const clean = email.toLowerCase().trim();
  const record = accounts.get(clean);
  return { exists: Boolean(record), record };
}
function registerAccount(record) {
  const clean = record.email.toLowerCase().trim();
  const existing = accounts.get(clean);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const entry = {
    email: clean,
    uid: record.uid || existing?.uid,
    displayName: record.displayName || existing?.displayName || "Student",
    usn: record.usn || existing?.usn || "4NI25EC023",
    createdAt: existing?.createdAt || now
  };
  accounts.set(clean, entry);
  persist();
  return entry;
}
function unregisterAccount(email) {
  const clean = email.toLowerCase().trim();
  const deleted = accounts.delete(clean);
  if (deleted) persist();
  return deleted;
}
var dataDir, registryFile, accounts;
var init_accounts = __esm({
  "server/accounts.ts"() {
    "use strict";
    dataDir = path3.resolve(process.cwd(), "data");
    registryFile = path3.join(dataDir, "registered_accounts.json");
    if (!fs3.existsSync(dataDir)) {
      try {
        fs3.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        console.warn("Could not create data dir:", e);
      }
    }
    accounts = /* @__PURE__ */ new Map();
    accounts.set("student@nie.ac.in", {
      email: "student@nie.ac.in",
      displayName: "Aryan",
      usn: "4NI25EC023",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    if (fs3.existsSync(registryFile)) {
      try {
        const raw = fs3.readFileSync(registryFile, "utf-8");
        const list = JSON.parse(raw);
        for (const item of list) {
          if (item?.email) {
            accounts.set(item.email.toLowerCase().trim(), item);
          }
        }
      } catch (err) {
        console.warn("Error reading registry file:", err);
      }
    }
  }
});

// server/firebaseAdmin.ts
import fs4 from "node:fs";
import path4 from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
function getAdminApp() {
  if (adminApp) return adminApp;
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }
  try {
    const configPath = path4.resolve(process.cwd(), "firebase-applet-config.json");
    let projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "deadlineiq-3a3b5";
    let storageBucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "deadlineiq-3a3b5.firebasestorage.app";
    if (fs4.existsSync(configPath)) {
      try {
        const raw = fs4.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.projectId) projectId = parsed.projectId;
        if (parsed.storageBucket) storageBucket = parsed.storageBucket;
      } catch {
      }
    }
    adminApp = initializeApp({
      projectId,
      storageBucket
    });
    return adminApp;
  } catch (err) {
    console.warn("Failed to initialize Firebase Admin SDK:", err);
    return null;
  }
}
function getAdminAuth() {
  const app2 = getAdminApp();
  if (!app2) return null;
  try {
    return getAuth(app2);
  } catch {
    return null;
  }
}
function getAdminFirestore() {
  const app2 = getAdminApp();
  if (!app2) return null;
  try {
    return getFirestore(app2);
  } catch {
    return null;
  }
}
function getAdminStorage() {
  const app2 = getAdminApp();
  if (!app2) return null;
  try {
    return getStorage(app2);
  } catch {
    return null;
  }
}
var adminApp;
var init_firebaseAdmin = __esm({
  "server/firebaseAdmin.ts"() {
    "use strict";
    adminApp = null;
  }
});

// server/app.ts
var app_exports = {};
__export(app_exports, {
  app: () => app
});
import express from "express";
var app;
var init_app = __esm({
  "server/app.ts"() {
    "use strict";
    init_ai();
    init_accounts();
    init_firebaseAdmin();
    app = express();
    app.use(express.json({ limit: "25mb" }));
    app.use((req, _res, next) => {
      if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/_")) {
        req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
      }
      next();
    });
    app.get("/api/ai/status", (_req, res) => {
      res.json({
        success: true,
        providers: aiService.getAvailableProviders()
      });
    });
    app.post("/api/extract-deadlines", async (req, res) => {
      try {
        const { text, file, currentDate, preferredProvider } = req.body || {};
        const trimmedText = typeof text === "string" ? text.trim() : "";
        if (!trimmedText && (!file || !file.base64)) {
          res.status(400).json({
            success: false,
            error: "Please provide an announcement text or upload a document/image."
          });
          return;
        }
        if (file) {
          const allowedMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/gif",
            "application/pdf"
          ];
          const mime = (file.mimeType || "").toLowerCase();
          if (mime && !allowedMimeTypes.includes(mime)) {
            res.status(400).json({
              success: false,
              error: "Unsupported file type. Please upload a PDF, PNG, JPG, or WebP document."
            });
            return;
          }
          if (typeof file.base64 === "string" && file.base64.length > 22 * 1024 * 1024) {
            res.status(400).json({
              success: false,
              error: "Selected file is too large (maximum size is 15MB). Please upload a smaller file or paste the text directly."
            });
            return;
          }
        }
        const result = await aiService.extractDeadlines(
          { text: trimmedText, file, currentDate },
          preferredProvider
        );
        res.json({
          success: true,
          deadlines: result.data,
          provider: result.provider,
          model: result.model
        });
      } catch (error) {
        console.error("AI extraction error:", error);
        const userMessage = aiService.sanitizeErrorMessage(error);
        res.status(500).json({
          success: false,
          error: userMessage
        });
      }
    });
    app.post("/api/extract-timetable", async (req, res) => {
      try {
        const { text, file, preferredProvider } = req.body || {};
        const trimmedText = typeof text === "string" ? text.trim() : "";
        if (!trimmedText && (!file || !file.base64)) {
          res.status(400).json({
            success: false,
            error: "Please upload a timetable file (PDF/Image) or paste the schedule text."
          });
          return;
        }
        if (file) {
          const allowedMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/gif",
            "application/pdf"
          ];
          const mime = (file.mimeType || "").toLowerCase();
          if (mime && !allowedMimeTypes.includes(mime)) {
            res.status(400).json({
              success: false,
              error: "Unsupported file type. Please upload a PDF, PNG, JPG, or WebP timetable."
            });
            return;
          }
          if (typeof file.base64 === "string" && file.base64.length > 22 * 1024 * 1024) {
            res.status(400).json({
              success: false,
              error: "Selected file is too large (maximum size is 15MB). Please upload a smaller file."
            });
            return;
          }
        }
        const result = await aiService.extractTimetable(
          { text: trimmedText, file },
          preferredProvider
        );
        res.json({
          success: true,
          entries: result.data,
          provider: result.provider,
          model: result.model
        });
      } catch (error) {
        console.error("AI timetable extraction error:", error);
        const userMessage = aiService.sanitizeErrorMessage(error);
        res.status(500).json({
          success: false,
          error: userMessage
        });
      }
    });
    app.post("/api/extract-exams", async (req, res) => {
      try {
        const { text, file, currentDate, preferredProvider } = req.body || {};
        const trimmedText = typeof text === "string" ? text.trim() : "";
        if (!trimmedText && (!file || !file.base64)) {
          res.status(400).json({
            success: false,
            error: "Please upload an exam schedule file (PDF/Image) or paste the exam timetable text."
          });
          return;
        }
        if (file) {
          const allowedMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/gif",
            "application/pdf"
          ];
          const mime = (file.mimeType || "").toLowerCase();
          if (mime && !allowedMimeTypes.includes(mime)) {
            res.status(400).json({
              success: false,
              error: "Unsupported file type. Please upload a PDF, PNG, JPG, or WebP exam schedule."
            });
            return;
          }
          if (typeof file.base64 === "string" && file.base64.length > 22 * 1024 * 1024) {
            res.status(400).json({
              success: false,
              error: "Selected file is too large (maximum size is 15MB). Please upload a smaller file."
            });
            return;
          }
        }
        const result = await aiService.extractExams(
          { text: trimmedText, file, currentDate },
          preferredProvider
        );
        res.json({
          success: true,
          exams: result.data,
          provider: result.provider,
          model: result.model
        });
      } catch (error) {
        console.error("AI exam extraction error:", error);
        const userMessage = aiService.sanitizeErrorMessage(error);
        res.status(500).json({
          success: false,
          error: userMessage
        });
      }
    });
    app.post("/api/plan-my-day", async (req, res) => {
      try {
        const payload = req.body || {};
        const result = await aiService.generatePlanMyDay(
          payload,
          payload?.preferredProvider
        );
        res.json({
          success: true,
          blocks: result.data,
          provider: result.provider,
          model: result.model
        });
      } catch (error) {
        console.warn("AI plan-my-day fallback triggered:", error?.message || error);
        const userMessage = aiService.sanitizeErrorMessage(error);
        res.json({
          success: false,
          error: userMessage
        });
      }
    });
    app.get("/api/auth/check-account", (req, res) => {
      const rawEmail = req.query.email || "";
      const cleanEmail = rawEmail.toLowerCase().trim();
      if (!cleanEmail) {
        return res.status(400).json({ error: "Email query param is required." });
      }
      const { exists, record } = checkAccount(cleanEmail);
      res.json({
        exists,
        email: cleanEmail,
        displayName: record?.displayName,
        usn: record?.usn
      });
    });
    app.post("/api/auth/register-account", (req, res) => {
      const { email, uid, displayName, usn } = req.body || {};
      const cleanEmail = (email || "").toLowerCase().trim();
      if (!cleanEmail) {
        return res.status(400).json({ error: "Valid email is required." });
      }
      const record = registerAccount({ email: cleanEmail, uid, displayName, usn });
      res.json({ success: true, email: cleanEmail, record });
    });
    app.post("/api/auth/unregister-account", (req, res) => {
      const { email } = req.body || {};
      const cleanEmail = (email || "").toLowerCase().trim();
      if (cleanEmail) {
        unregisterAccount(cleanEmail);
      }
      res.json({ success: true });
    });
    app.post("/api/auth/delete-account", async (req, res) => {
      try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const adminAuth = getAdminAuth();
        const adminDb = getAdminFirestore();
        const adminStorage = getAdminStorage();
        if (!token) {
          return res.status(401).json({ error: "Missing authentication bearer token." });
        }
        let uid = "";
        let email = (req.body?.email || "").toLowerCase().trim();
        if (adminAuth) {
          try {
            const decoded = await adminAuth.verifyIdToken(token);
            uid = decoded.uid;
            if (decoded.email) {
              email = decoded.email.toLowerCase().trim();
            }
          } catch (err) {
            console.warn("Verify ID token warning:", err?.message || err);
            return res.status(401).json({ error: "Invalid or expired authentication token." });
          }
        }
        if (!uid) {
          return res.status(401).json({ error: "Could not verify authenticated user." });
        }
        if (adminDb) {
          try {
            const userDocRef = adminDb.collection("users").doc(uid);
            await adminDb.recursiveDelete(userDocRef);
          } catch (err) {
            console.warn(`Firestore recursive delete warning for ${uid}:`, err);
          }
        }
        if (adminStorage) {
          try {
            const bucket = adminStorage.bucket();
            await bucket.deleteFiles({ prefix: `users/${uid}/` });
          } catch (err) {
            console.warn(`Storage delete files warning for ${uid}:`, err);
          }
        }
        if (email) {
          unregisterAccount(email);
        }
        if (adminAuth) {
          try {
            await adminAuth.deleteUser(uid);
          } catch (err) {
            console.warn(`Admin deleteUser warning for ${uid}:`, err);
          }
        }
        res.json({
          success: true,
          message: "Account, Firestore records, Storage files, and auth credentials permanently deleted.",
          uid
        });
      } catch (error) {
        console.error("Account deletion endpoint error:", error);
        res.status(500).json({ error: "Server account deletion failed. Please try again." });
      }
    });
  }
});

// api/index.ts
var appHandler = null;
async function getApp() {
  if (!appHandler) {
    const mod = await Promise.resolve().then(() => (init_app(), app_exports));
    appHandler = mod.app || mod.default || mod;
  }
  return appHandler;
}
async function handler(req, res) {
  try {
    const app2 = await getApp();
    return app2(req, res);
  } catch (err) {
    console.error("Vercel Serverless Function initialization error:", err);
    res.status(500).json({
      success: false,
      error: "Server initialization error. Please check server logs."
    });
  }
}
export {
  handler as default
};
