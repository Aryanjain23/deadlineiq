import type { Deadline } from "./deadlines";
import type { TimetableEntry, DayOfWeek } from "./timetable";
import type { CalendarEvent, EventCategory } from "./firebase/types";

export type { CalendarEvent, EventCategory };

export const EVENT_CATEGORIES: EventCategory[] = [
  "Academic",
  "Sports",
  "Personal",
  "Other",
];

export const CATEGORY_META: Record<
  EventCategory,
  {
    label: string;
    color: string;
    bgBadge: string;
    borderColor: string;
    dotColor: string;
  }
> = {
  Academic: {
    label: "Academic",
    color: "#76d8fb",
    bgBadge: "bg-[#76d8fb]/15 text-[#bae6fd]",
    borderColor: "border-[#76d8fb]/35",
    dotColor: "bg-[#76d8fb]",
  },
  Sports: {
    label: "Sports",
    color: "#75d5b0",
    bgBadge: "bg-[#75d5b0]/15 text-[#a7f3d0]",
    borderColor: "border-[#75d5b0]/35",
    dotColor: "bg-[#75d5b0]",
  },
  Personal: {
    label: "Personal",
    color: "#a895ff",
    bgBadge: "bg-[#a895ff]/15 text-[#d8ceff]",
    borderColor: "border-[#a895ff]/35",
    dotColor: "bg-[#a895ff]",
  },
  Other: {
    label: "Other",
    color: "#fbaf72",
    bgBadge: "bg-[#fbaf72]/15 text-[#fed7aa]",
    borderColor: "border-[#fbaf72]/35",
    dotColor: "bg-[#fbaf72]",
  },
};

export type CalendarItemType = "event" | "deadline" | "class" | "google";

export interface UnifiedCalendarItem {
  id: string;
  itemType: CalendarItemType;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  allDay?: boolean;
  category: EventCategory;
  location?: string;
  notes?: string;
  isGoogleEvent?: boolean;
  isGoogleSynced?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  googleCalendarName?: string;
  htmlLink?: string;
  deadlineData?: Deadline;
  timetableData?: TimetableEntry;
  eventData?: CalendarEvent;
}

export function getEventsStorageKey(userKey: string): string {
  const cleanKey = (userKey || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  return `deadlineiq_events_${cleanKey}`;
}

export function loadEvents(userKey: string): CalendarEvent[] {
  try {
    const key = getEventsStorageKey(userKey);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (ev) => ev && !ev.id?.startsWith("demo-") && !ev.id?.startsWith("sample-")
      );
    }
    return [];
  } catch (error) {
    console.error("Failed to load events from localStorage:", error);
    return [];
  }
}

export function saveEvents(userKey: string, events: CalendarEvent[]): void {
  try {
    const key = getEventsStorageKey(userKey);
    const sanitized = events.filter(
      (ev) => ev && !ev.id?.startsWith("demo-") && !ev.id?.startsWith("sample-")
    );
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to save events to localStorage:", error);
  }
}

/**
 * Builds unified calendar items rendering user events AND existing deadlines,
 * without duplicating deadlines in database.
 */
export function buildUnifiedCalendarItems(
  events: CalendarEvent[],
  deadlines: Deadline[],
  googleEvents: UnifiedCalendarItem[] = []
): UnifiedCalendarItem[] {
  const items: UnifiedCalendarItem[] = [];
  const syncedGoogleIds = new Set<string>();

  // 1. Add User Calendar Events
  for (const ev of events) {
    if (!ev || !ev.date) continue;
    if (ev.googleEventId) {
      syncedGoogleIds.add(ev.googleEventId);
    }
    items.push({
      id: ev.id,
      itemType: "event",
      title: ev.title,
      date: ev.date,
      startTime: ev.startTime,
      endTime: ev.endTime,
      allDay: ev.allDay,
      category: ev.category || "Other",
      location: ev.location,
      notes: ev.notes,
      isGoogleSynced: Boolean(ev.isGoogleSynced || ev.googleEventId),
      googleEventId: ev.googleEventId,
      googleCalendarId: ev.googleCalendarId,
      eventData: ev,
    });
  }

  // 2. Add Deadlines as Calendar Items (render-only integration, no database duplicate)
  for (const dl of deadlines) {
    if (!dl || !dl.dueDate) continue;
    items.push({
      id: `cal-dl-${dl.id}`,
      itemType: "deadline",
      title: dl.taskName,
      date: dl.dueDate,
      startTime: dl.dueTime || "23:59",
      allDay: !dl.dueTime,
      category: "Academic",
      location: dl.subject,
      notes: dl.description,
      deadlineData: dl,
    });
  }

  // 3. Add Google Calendar Events (prevent duplicates if already linked to a DeadlineIQ event)
  for (const gItem of googleEvents) {
    if (!gItem || !gItem.date) continue;
    if (gItem.googleEventId && syncedGoogleIds.has(gItem.googleEventId)) {
      continue; // Deduplicate: already represented by the synchronized DeadlineIQ event
    }
    items.push(gItem);
  }

  // Sort by date then start time
  return items.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    const timeA = a.allDay ? "00:00" : a.startTime || "23:59";
    const timeB = b.allDay ? "00:00" : b.startTime || "23:59";
    return timeA.localeCompare(timeB);
  });
}

/**
 * Calendar Month Matrix generator
 */
export interface CalendarCell {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function getMonthMatrix(year: number, month: number): CalendarCell[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateIso(today);

  // Month is 0-indexed (0 = Jan, 11 = Dec)
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Starting day index (0 = Monday, 6 = Sunday for academic/standard layout)
  // getDay() gives 0 for Sunday
  const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0

  const weeks: CalendarCell[][] = [];
  let currentWeek: CalendarCell[] = [];

  // Previous month padding days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const cellDate = new Date(year, month - 1, d);
    const dateStr = formatDateIso(cellDate);
    currentWeek.push({
      date: cellDate,
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Current month days
  const totalDays = lastDayOfMonth.getDate();
  for (let d = 1; d <= totalDays; d++) {
    const cellDate = new Date(year, month, d);
    const dateStr = formatDateIso(cellDate);
    currentWeek.push({
      date: cellDate,
      dateStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Next month padding days to complete grid
  let nextMonthDay = 1;
  while (currentWeek.length > 0 && currentWeek.length < 7) {
    const cellDate = new Date(year, month + 1, nextMonthDay);
    const dateStr = formatDateIso(cellDate);
    currentWeek.push({
      date: cellDate,
      dateStr,
      dayNumber: nextMonthDay,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
    nextMonthDay++;
  }
  if (currentWeek.length === 7) {
    weeks.push(currentWeek);
  }

  return weeks;
}

export function getWeekDays(baseDate: Date): CalendarCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateIso(today);

  // Find Monday of current week
  const dayIndex = (baseDate.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - dayIndex);
  monday.setHours(0, 0, 0, 0);

  const days: CalendarCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDateIso(d);
    days.push({
      date: d,
      dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === baseDate.getMonth(),
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

export function formatDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMonthYearTitle(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getNearestUpcomingEvent(events: CalendarEvent[]): CalendarEvent | null {
  if (!events || events.length === 0) return null;
  const todayStr = formatDateIso(new Date());

  const upcoming = events
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return (a.startTime || "00:00").localeCompare(b.startTime || "00:00");
    });

  return upcoming[0] || null;
}
