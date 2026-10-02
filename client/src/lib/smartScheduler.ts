import {
  getNextClassForSubject,
  type TimetableEntry,
  type NextClassResult,
  formatTime12Hour,
} from "./timetable";
import type { CalendarEvent } from "./calendar";

export interface DateSuggestion {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  formattedDisplay: string;
  reasoning: string;
  confidence: "HIGH" | "MEDIUM";
  hasCalendarConflict: boolean;
  conflictingEvents: CalendarEvent[];
  matchedClass?: TimetableEntry;
  suggestedActionLabel: string;
}

/**
 * Suggests an optimal deadline submission date based on:
 * 1. The user's timetable recurring classes for the subject
 * 2. Upcoming classes
 * 3. Existing calendar events (academic, sports, personal, other)
 * 
 * CRITICAL RULE: For deadlines that have no explicit due date, this NEVER
 * automatically invents a date. It only suggests a date when actionable
 * schedule context (matching class or event) exists, and presents it for
 * user confirmation.
 */
export function suggestDeadlineDate(params: {
  subject: string;
  timetable: TimetableEntry[];
  calendarEvents: CalendarEvent[];
  baseDate?: Date;
}): DateSuggestion | null {
  const { subject, timetable, calendarEvents, baseDate = new Date() } = params;
  const cleanSubject = subject.trim();

  if (!cleanSubject) {
    return null;
  }

  // 1. Check if user's timetable has an upcoming class for this subject
  const nextClass = getNextClassForSubject(timetable, cleanSubject, baseDate);

  if (nextClass) {
    // Check if there are existing calendar events on this target date
    const dayEvents = calendarEvents.filter(
      (ev) => ev && ev.date === nextClass.dateStr
    );

    // Check for any potential time overlaps or conflicts
    const [classHour] = nextClass.timeStr.split(":").map(Number);
    const conflictingEvents = dayEvents.filter((ev) => {
      if (ev.allDay) return true;
      if (!ev.startTime) return false;
      const [evHour] = ev.startTime.split(":").map(Number);
      // Considered close if within 2 hours
      return Math.abs(evHour - (classHour || 9)) <= 2;
    });

    const hasConflict = conflictingEvents.length > 0;

    let reasoning = `Next ${nextClass.entry.subject} class is scheduled for ${nextClass.formattedDisplay}`;
    if (nextClass.entry.room) {
      reasoning += ` in ${nextClass.entry.room}`;
    }

    if (hasConflict) {
      const conflictNames = conflictingEvents.map((e) => `"${e.title}"`).join(", ");
      reasoning += `. Note: You also have ${conflictNames} scheduled near this time.`;
    } else if (dayEvents.length > 0) {
      reasoning += `. (You have ${dayEvents.length} other event${dayEvents.length === 1 ? "" : "s"} on this day, with no direct overlap).`;
    } else {
      reasoning += `. Your calendar is clear on this date.`;
    }

    return {
      dateStr: nextClass.dateStr,
      timeStr: nextClass.timeStr,
      formattedDisplay: nextClass.formattedDisplay,
      reasoning,
      confidence: "HIGH",
      hasCalendarConflict: hasConflict,
      conflictingEvents: dayEvents,
      matchedClass: nextClass.entry,
      suggestedActionLabel: `Apply ${nextClass.entry.subject} Class Date (${nextClass.dateStr})`,
    };
  }

  // 2. If no timetable class matches, check if there is an academic calendar event
  // related to this subject in the upcoming 14 days
  const todayStr = baseDate.toISOString().split("T")[0];
  const queryLower = cleanSubject.toLowerCase();

  const matchingEvent = calendarEvents
    .filter(
      (ev) =>
        ev &&
        ev.date >= todayStr &&
        (ev.title.toLowerCase().includes(queryLower) ||
          (ev.location && ev.location.toLowerCase().includes(queryLower)) ||
          (ev.notes && ev.notes.toLowerCase().includes(queryLower)))
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (matchingEvent) {
    const formattedDate = new Date(`${matchingEvent.date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    const timeDisplay = matchingEvent.startTime
      ? ` at ${formatTime12Hour(matchingEvent.startTime)}`
      : "";

    return {
      dateStr: matchingEvent.date,
      timeStr: matchingEvent.startTime || "23:59",
      formattedDisplay: `${formattedDate}${timeDisplay}`,
      reasoning: `Found related calendar event "${matchingEvent.title}" on ${formattedDate}${timeDisplay}.`,
      confidence: "MEDIUM",
      hasCalendarConflict: false,
      conflictingEvents: [],
      suggestedActionLabel: `Apply Event Date (${matchingEvent.date})`,
    };
  }

  // 3. IMPORTANT: Do NOT invent an arbitrary date when no schedule context exists
  return null;
}
