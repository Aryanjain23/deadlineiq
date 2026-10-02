import { nanoid } from "nanoid";
import type { DayOfWeek, TimetableEntry } from "./timetable";
import type { Deadline, ImportanceLevel } from "./deadlines";

export type ExamType =
  | "Internal"
  | "Lab"
  | "SEE"
  | "Quiz"
  | "Practical"
  | "Other";

export interface Exam {
  id: string;
  subject: string;
  subjectCode?: string;
  examDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm format, e.g. "10:00"
  endTime?: string; // HH:mm format, e.g. "11:30"
  examType: ExamType;
  room?: string; // Room / Hall, e.g. "Room 204"
  notes?: string;
  createdAt: string;
}

export const EXAM_TYPES: ExamType[] = [
  "Internal",
  "Lab",
  "SEE",
  "Quiz",
  "Practical",
  "Other",
];

export function getExamsStorageKey(userKey: string): string {
  const cleanKey = (userKey || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  return `deadlineiq_exams_${cleanKey}`;
}

export function loadExams(userKey: string): Exam[] {
  try {
    const key = getExamsStorageKey(userKey);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out any legacy test/demo items created during development
      return parsed.filter((ex) => ex && !ex.id?.startsWith("exam-demo-") && !ex.id?.startsWith("demo-") && !ex.id?.startsWith("sample-"));
    }
    return [];
  } catch (error) {
    console.error("Failed to load exams from localStorage:", error);
    return [];
  }
}

export function saveExams(userKey: string, exams: Exam[]): void {
  try {
    const key = getExamsStorageKey(userKey);
    // Ensure no legacy demo items are preserved
    const sanitized = exams.filter((ex) => ex && !ex.id?.startsWith("exam-demo-") && !ex.id?.startsWith("demo-") && !ex.id?.startsWith("sample-"));
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to save exams to localStorage:", error);
  }
}

export function sortExamsChronologically(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    // Sort by examDate first
    const dateComp = a.examDate.localeCompare(b.examDate);
    if (dateComp !== 0) return dateComp;
    // Then by startTime
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
}

export function formatTime12Hour(time24: string): string {
  if (!time24) return "";
  const parts = time24.split(":");
  if (parts.length < 2) return time24;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return time24;

  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export function formatExamDateDisplay(dateStr: string): {
  dayNum: string;
  monthShort: string;
  fullDate: string;
  dayOfWeek: string;
} {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayNum = String(day).padStart(2, "0");
    const monthShort = dateObj
      .toLocaleDateString("en-US", { month: "short" })
      .toUpperCase();
    const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "short" });
    const fullDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return { dayNum, monthShort, fullDate, dayOfWeek };
  } catch {
    return {
      dayNum: "--",
      monthShort: "EXAM",
      fullDate: dateStr,
      dayOfWeek: "",
    };
  }
}

export function getDaysUntil(dateStr: string): number {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 999;
  }
}

export function getNearestUpcomingExam(exams: Exam[]): Exam | null {
  const sorted = sortExamsChronologically(exams);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find nearest upcoming (today or future)
  for (const exam of sorted) {
    const days = getDaysUntil(exam.examDate);
    if (days >= 0) {
      return exam;
    }
  }

  // Fallback to first if none in future
  return sorted[0] || null;
}

export function getRelativeTimeDescription(dateStr: string, timeStr?: string): string {
  const days = getDaysUntil(dateStr);
  const timeFormatted = timeStr ? formatTime12Hour(timeStr) : "";

  if (days < 0) {
    const pastDays = Math.abs(days);
    return pastDays === 1 ? "Yesterday" : `${pastDays} days ago`;
  }
  if (days === 0) {
    return timeFormatted ? `Today · ${timeFormatted}` : "Today";
  }
  if (days === 1) {
    return timeFormatted ? `Tomorrow · ${timeFormatted}` : "Tomorrow";
  }
  if (days === 2) {
    return `In 2 days${timeFormatted ? ` · ${timeFormatted}` : ""}`;
  }
  if (days <= 7) {
    return `In ${days} days${timeFormatted ? ` · ${timeFormatted}` : ""}`;
  }
  const weeks = Math.round(days / 7);
  return `In ${days} days (${weeks} wk${weeks > 1 ? "s" : ""})`;
}

// =================================================================
// ACADEMIC RADAR INTEGRATION
// =================================================================

export type RadarItemType = "exam" | "deadline" | "class";

export interface RadarItem {
  id: string;
  type: RadarItemType;
  title: string;
  subject: string;
  subjectCode?: string;
  date: string; // YYYY-MM-DD
  time?: string;
  endTime?: string;
  urgencyGroup: "TODAY" | "TOMORROW" | "IN 2 DAYS" | "IN 3 DAYS" | "THIS WEEK" | "UPCOMING" | "PAST";
  daysRemaining: number;
  importance?: ImportanceLevel;
  examType?: ExamType;
  room?: string;
  description?: string;
  isCompleted?: boolean;
  relatedDeadlines?: Deadline[];
}

export function getUrgencyGroup(daysRemaining: number): RadarItem["urgencyGroup"] {
  if (daysRemaining < 0) return "PAST";
  if (daysRemaining === 0) return "TODAY";
  if (daysRemaining === 1) return "TOMORROW";
  if (daysRemaining === 2) return "IN 2 DAYS";
  if (daysRemaining === 3) return "IN 3 DAYS";
  if (daysRemaining <= 7) return "THIS WEEK";
  return "UPCOMING";
}

/**
 * Builds the consolidated Academic Radar feed combining:
 * 1. Active deadlines (sorted chronologically & by priority)
 * 2. Upcoming exams
 * 3. Class timetable events for today/tomorrow
 * 4. Cross-references: upcoming exams with pending deadlines in the same subject
 */
export function buildAcademicRadar(
  deadlines: Deadline[],
  exams: Exam[],
  timetable: TimetableEntry[]
): RadarItem[] {
  const items: RadarItem[] = [];
  const today = new Date();
  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const todayStr = formatDate(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  // Day names
  const dayNames: DayOfWeek[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const todayDayName = dayNames[today.getDay()];
  const tomorrowDayName = dayNames[tomorrow.getDay()];

  // 1. Process active deadlines
  const activeDeadlines = deadlines.filter((d) => !d.completed);
  for (const d of activeDeadlines) {
    const days = getDaysUntil(d.dueDate);
    items.push({
      id: `radar-dl-${d.id}`,
      type: "deadline",
      title: d.taskName,
      subject: d.subject,
      date: d.dueDate,
      time: d.dueTime,
      urgencyGroup: getUrgencyGroup(days),
      daysRemaining: days,
      importance: d.importance,
      description: d.description,
      isCompleted: d.completed,
    });
  }

  // 2. Process upcoming exams
  for (const ex of exams) {
    const days = getDaysUntil(ex.examDate);
    // Find any related active deadlines for this subject
    const related = activeDeadlines.filter(
      (d) =>
        d.subject.toLowerCase() === ex.subject.toLowerCase() ||
        (ex.subjectCode && d.subject.toLowerCase().includes(ex.subjectCode.toLowerCase()))
    );

    items.push({
      id: `radar-exam-${ex.id}`,
      type: "exam",
      title: `${ex.subject} ${ex.examType} Exam`,
      subject: ex.subject,
      subjectCode: ex.subjectCode,
      date: ex.examDate,
      time: ex.startTime,
      endTime: ex.endTime,
      urgencyGroup: getUrgencyGroup(days),
      daysRemaining: days,
      examType: ex.examType,
      room: ex.room,
      description: ex.notes,
      relatedDeadlines: related,
    });
  }

  // 3. Process today and tomorrow's classes from timetable
  const todayClasses = timetable.filter((t) => t.day === todayDayName);
  for (const c of todayClasses) {
    items.push({
      id: `radar-class-today-${c.id}`,
      type: "class",
      title: `${c.subject} Class`,
      subject: c.subject,
      subjectCode: c.subjectCode,
      date: todayStr,
      time: c.startTime,
      endTime: c.endTime,
      urgencyGroup: "TODAY",
      daysRemaining: 0,
      room: c.room,
      description: `Weekly schedule (${c.startTime} - ${c.endTime})`,
    });
  }

  const tomorrowClasses = timetable.filter((t) => t.day === tomorrowDayName);
  for (const c of tomorrowClasses) {
    items.push({
      id: `radar-class-tomorrow-${c.id}`,
      type: "class",
      title: `${c.subject} Class`,
      subject: c.subject,
      subjectCode: c.subjectCode,
      date: tomorrowStr,
      time: c.startTime,
      endTime: c.endTime,
      urgencyGroup: "TOMORROW",
      daysRemaining: 1,
      room: c.room,
      description: `Weekly schedule (${c.startTime} - ${c.endTime})`,
    });
  }

  // Sort strictly chronologically:
  // First by daysRemaining ascending (today -> tomorrow -> in 2 days -> ...)
  // Then by time ascending
  // Then by type priority: Exams > Critical/High Deadlines > Classes > other
  return items.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }

    const timeA = a.time || "23:59";
    const timeB = b.time || "23:59";
    const timeComp = timeA.localeCompare(timeB);
    if (timeComp !== 0) return timeComp;

    // Weight by type
    const weightMap: Record<RadarItemType, number> = {
      exam: 1,
      deadline: 2,
      class: 3,
    };
    return (weightMap[a.type] || 5) - (weightMap[b.type] || 5);
  });
}
