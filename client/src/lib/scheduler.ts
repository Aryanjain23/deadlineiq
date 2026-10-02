import type { TimetableEntry, DayOfWeek } from "./timetable";
import { getNextClassForSubject, DAYS_OF_WEEK } from "./timetable";
import type { CalendarEvent } from "./calendar";

export interface DateSuggestion {
  suggestedDate: string; // YYYY-MM-DD
  suggestedTime?: string; // HH:mm
  dayOfWeek: DayOfWeek;
  subject: string;
  classEntry?: TimetableEntry;
  formattedDisplay: string; // e.g. "Monday, Oct 5 · 09:00 AM"
  reason: string;
  hasCalendarConflict: boolean;
  conflictingEventTitle?: string;
  relativeDays: number;
}

export interface SuggestDateParams {
  subject: string;
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  baseDate?: Date;
}

/**
 * Connects Timetable + Calendar + Deadlines.
 * When a deadline has no explicit due date, this helper inspects:
 * 1. User's timetable for the relevant subject
 * 2. Next upcoming class occurrence
 * 3. User's calendar events on that target date
 *
 * NOTE: This function NEVER automatically applies or writes a date.
 * It strictly returns a candidate suggestion for user review and confirmation.
 */
export function suggestDateForDeadline({
  subject,
  timetable,
  events,
  baseDate = new Date(),
}: SuggestDateParams): DateSuggestion | null {
  if (!subject.trim() || !timetable || timetable.length === 0) {
    return null;
  }

  // 1. Find next upcoming class for this subject
  const nextClass = getNextClassForSubject(timetable, subject, baseDate);
  if (!nextClass) {
    return null;
  }

  // 2. Check for calendar events on that same date
  const targetDateStr = nextClass.dateStr;
  const sameDayEvents = (events || []).filter((e) => e && e.date === targetDateStr);

  let hasConflict = false;
  let conflictingTitle: string | undefined;

  for (const ev of sameDayEvents) {
    if (ev.allDay) {
      hasConflict = true;
      conflictingTitle = ev.title;
      break;
    }
    if (ev.startTime && nextClass.timeStr) {
      // Check time overlap (within 1 hour window)
      const evHour = parseInt(ev.startTime.split(":")[0], 10);
      const classHour = parseInt(nextClass.timeStr.split(":")[0], 10);
      if (Math.abs(evHour - classHour) <= 1) {
        hasConflict = true;
        conflictingTitle = ev.title;
        break;
      }
    }
  }

  const roomNote = nextClass.entry.room ? ` in ${nextClass.entry.room}` : "";
  const instructorNote = nextClass.entry.instructor ? ` with ${nextClass.entry.instructor}` : "";

  let reason = `Suggested submission in next ${nextClass.entry.subject} class${roomNote}${instructorNote}.`;
  if (hasConflict && conflictingTitle) {
    reason += ` (Note: "${conflictingTitle}" is also scheduled on this day).`;
  }

  return {
    suggestedDate: nextClass.dateStr,
    suggestedTime: nextClass.timeStr,
    dayOfWeek: nextClass.dayOfWeek,
    subject: nextClass.entry.subject,
    classEntry: nextClass.entry,
    formattedDisplay: nextClass.formattedDisplay,
    reason,
    hasCalendarConflict: hasConflict,
    conflictingEventTitle: conflictingTitle,
    relativeDays: nextClass.relativeDays,
  };
}
