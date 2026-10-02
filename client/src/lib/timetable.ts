export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface TimetableEntry {
  id: string;
  subject: string;
  subjectCode?: string;
  day: DayOfWeek;
  startTime: string; // HH:mm format, e.g. "09:00"
  endTime: string;   // HH:mm format, e.g. "10:00"
  room?: string;
  instructor?: string;
}

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DAY_INDEX_MAP: Record<DayOfWeek, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export function getTimetableStorageKey(userKey: string): string {
  const cleanKey = (userKey || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  return `deadlineiq_timetable_${cleanKey}`;
}

export function loadTimetable(userKey: string): TimetableEntry[] {
  try {
    const key = getTimetableStorageKey(userKey);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as TimetableEntry[];
    if (!Array.isArray(parsed)) return [];
    // Filter out any legacy test/demo items created during development
    return parsed.filter((t) => t && !t.id?.startsWith("demo-") && !t.id?.startsWith("tt-demo-"));
  } catch (error) {
    console.error("Failed to load timetable:", error);
    return [];
  }
}

export function saveTimetable(userKey: string, entries: TimetableEntry[]): void {
  try {
    const key = getTimetableStorageKey(userKey);
    // Ensure no legacy demo items are preserved
    const sanitized = entries.filter((t) => t && !t.id?.startsWith("demo-") && !t.id?.startsWith("tt-demo-"));
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to save timetable:", error);
  }
}

export function getUniqueSubjects(entries: TimetableEntry[]): string[] {
  const set = new Set<string>();
  entries.forEach((e) => {
    if (e.subject?.trim()) {
      set.add(e.subject.trim());
    }
  });
  return Array.from(set).sort();
}

export interface NextClassResult {
  entry: TimetableEntry;
  targetDate: Date;
  dateStr: string;        // YYYY-MM-DD
  timeStr: string;        // HH:mm
  dayOfWeek: DayOfWeek;
  formattedDisplay: string; // e.g. "Monday, Oct 5 · 09:00 AM"
  relativeDays: number;
}

/**
 * Calculates the next upcoming occurrence of a class for a given subject.
 * Matches subject names fuzzily (case-insensitive, includes partial matching e.g. "Physics" matches "Physics Lab" or vice versa).
 */
export function getNextClassForSubject(
  entries: TimetableEntry[],
  subjectQuery: string,
  baseDate: Date = new Date()
): NextClassResult | null {
  const query = subjectQuery.trim().toLowerCase();
  if (!query || entries.length === 0) return null;

  // Filter entries that match subject name or code
  const matchingEntries = entries.filter((e) => {
    const sName = e.subject.toLowerCase();
    const sCode = (e.subjectCode || "").toLowerCase();
    return (
      sName === query ||
      sName.includes(query) ||
      query.includes(sName) ||
      (sCode && sCode === query)
    );
  });

  if (matchingEntries.length === 0) return null;

  const currentDayIndex = baseDate.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const currentHour = baseDate.getHours();
  const currentMinute = baseDate.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  let bestResult: NextClassResult | null = null;
  let smallestDiffMinutes = Infinity;

  for (const entry of matchingEntries) {
    const targetDayIndex = DAY_INDEX_MAP[entry.day];
    const [startH, startM] = entry.startTime.split(":").map(Number);
    const entryStartMinutes = (startH || 0) * 60 + (startM || 0);

    // Calculate days ahead
    let daysAhead = (targetDayIndex - currentDayIndex + 7) % 7;

    // If it's today but the class has already passed, schedule for next week
    if (daysAhead === 0 && entryStartMinutes <= currentTimeMinutes) {
      daysAhead = 7;
    }

    const diffMinutes = daysAhead * 24 * 60 + (entryStartMinutes - currentTimeMinutes);

    if (diffMinutes > 0 && diffMinutes < smallestDiffMinutes) {
      smallestDiffMinutes = diffMinutes;

      const targetDate = new Date(baseDate);
      targetDate.setDate(baseDate.getDate() + daysAhead);
      targetDate.setHours(startH || 9, startM || 0, 0, 0);

      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, "0");
      const day = String(targetDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const timeStr = entry.startTime;
      const period = (startH || 0) >= 12 ? "PM" : "AM";
      const displayH = (startH || 0) % 12 || 12;
      const displayM = String(startM || 0).padStart(2, "0");

      const monthName = targetDate.toLocaleDateString("en-US", { month: "short" });
      const dayNum = targetDate.getDate();

      bestResult = {
        entry,
        targetDate,
        dateStr,
        timeStr,
        dayOfWeek: entry.day,
        formattedDisplay: `${entry.day}, ${monthName} ${dayNum} · ${displayH}:${displayM} ${period}`,
        relativeDays: daysAhead,
      };
    }
  }

  return bestResult;
}

export function formatTime12Hour(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const displayM = String(m || 0).padStart(2, "0");
  return `${displayH}:${displayM} ${period}`;
}

export interface UpcomingClassResult {
  entry: TimetableEntry;
  targetDate: Date;
  dateStr: string;
  timeStr: string;
  dayOfWeek: DayOfWeek;
  formattedDisplay: string;
  isToday: boolean;
  isTomorrow: boolean;
  relativeDays: number;
}

export function getNextUpcomingClass(
  entries: TimetableEntry[],
  baseDate: Date = new Date()
): UpcomingClassResult | null {
  if (!entries || entries.length === 0) return null;

  const currentDayIndex = baseDate.getDay();
  const currentHour = baseDate.getHours();
  const currentMinute = baseDate.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  let bestResult: UpcomingClassResult | null = null;
  let smallestDiffMinutes = Infinity;

  for (const entry of entries) {
    const targetDayIndex = DAY_INDEX_MAP[entry.day];
    const [startH, startM] = entry.startTime.split(":").map(Number);
    const entryStartMinutes = (startH || 0) * 60 + (startM || 0);

    let daysAhead = (targetDayIndex - currentDayIndex + 7) % 7;
    // If it's today but class has already passed, schedule for next week
    if (daysAhead === 0 && entryStartMinutes <= currentTimeMinutes) {
      daysAhead = 7;
    }

    const diffMinutes = daysAhead * 24 * 60 + (entryStartMinutes - currentTimeMinutes);
    if (diffMinutes > 0 && diffMinutes < smallestDiffMinutes) {
      smallestDiffMinutes = diffMinutes;
      const targetDate = new Date(baseDate);
      targetDate.setDate(baseDate.getDate() + daysAhead);
      targetDate.setHours(startH || 9, startM || 0, 0, 0);

      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, "0");
      const day = String(targetDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const period = (startH || 0) >= 12 ? "PM" : "AM";
      const displayH = (startH || 0) % 12 || 12;
      const displayM = String(startM || 0).padStart(2, "0");
      const monthName = targetDate.toLocaleDateString("en-US", { month: "short" });
      const dayNum = targetDate.getDate();

      bestResult = {
        entry,
        targetDate,
        dateStr,
        timeStr: entry.startTime,
        dayOfWeek: entry.day,
        formattedDisplay: `${entry.day}, ${monthName} ${dayNum} · ${displayH}:${displayM} ${period}`,
        isToday: daysAhead === 0,
        isTomorrow: daysAhead === 1,
        relativeDays: daysAhead,
      };
    }
  }

  return bestResult;
}
