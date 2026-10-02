import type { Deadline, ImportanceLevel } from "./deadlines";
import type { TimetableEntry, DayOfWeek } from "./timetable";
import type { CalendarEvent } from "./calendar";
import type {
  ScheduleBlock,
  ScheduleBlockType,
  PlanPreferences,
  SavedDailyPlan,
} from "./firebase/types";

export interface BuildPlanParams {
  deadlines: Deadline[];
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  preferences: PlanPreferences;
  currentDate?: Date; // Defaults to now
}

export const DEFAULT_PLAN_PREFERENCES: PlanPreferences = {
  startTime: "09:00",
  endTime: "21:00",
  sessionLengthMinutes: 50,
  breakLengthMinutes: 10,
};

/**
 * Helper to convert "HH:mm" to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Helper to convert minutes from midnight to "HH:mm"
 */
export function minutesToTime(mins: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function getTodayDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[date.getDay()];
}

export function formatDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatCurrentTimeHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Generates an intelligent schedule for today via Gemini AI backend,
 * with deterministic fallback.
 */
export async function generateDailySchedule(
  params: BuildPlanParams
): Promise<{ blocks: ScheduleBlock[]; isAiGenerated: boolean }> {
  const now = params.currentDate || new Date();
  const todayStr = formatDateToYYYYMMDD(now);
  const currentTimeStr = formatCurrentTimeHHMM(now);
  const todayDay = getTodayDayOfWeek(now);

  const activeDeadlines = (params.deadlines || []).filter((d) => !d.completed);

  // 1. Gather Fixed Commitments for Today
  const todayClasses = (params.timetable || []).filter((t) => t.day === todayDay);
  const todayEvents = (params.events || []).filter(
    (ev) => ev && ev.date === todayStr && !ev.allDay
  );

  // If there are zero active deadlines AND zero classes AND zero events:
  if (activeDeadlines.length === 0 && todayClasses.length === 0 && todayEvents.length === 0) {
    return { blocks: [], isAiGenerated: false };
  }

  // Build Payload for Gemini
  const fixedCommitments = [
    ...todayClasses.map((c) => ({
      id: `class-${c.id}`,
      title: c.subject,
      startTime: c.startTime,
      endTime: c.endTime,
      type: "class" as const,
      location: c.room,
      subject: c.subject,
    })),
    ...todayEvents.map((ev) => ({
      id: `event-${ev.id}`,
      title: ev.title,
      startTime: ev.startTime || "10:00",
      endTime: ev.endTime || minutesToTime(timeToMinutes(ev.startTime || "10:00") + 60),
      type: "event" as const,
      location: ev.location,
      subject: ev.category,
    })),
  ];

  const payloadDeadlines = activeDeadlines.map((d) => {
    const isOverdue = d.dueDate < todayStr;
    const isDueToday = d.dueDate === todayStr;
    // Check if due in next 2 days
    let isDueSoon = false;
    try {
      const due = new Date(`${d.dueDate}T00:00:00`).getTime();
      const today = new Date(`${todayStr}T00:00:00`).getTime();
      const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
      isDueSoon = diffDays > 0 && diffDays <= 2;
    } catch {}

    return {
      id: d.id,
      taskName: d.taskName,
      subject: d.subject,
      dueDate: d.dueDate,
      dueTime: d.dueTime,
      importance: d.importance,
      description: d.description,
      isOverdue,
      isDueToday,
      isDueSoon,
    };
  });

  // Try Gemini AI API first
  try {
    const res = await fetch("/api/plan-my-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentDate: todayStr,
        currentTime: currentTimeStr,
        preferences: params.preferences,
        fixedCommitments,
        activeDeadlines: payloadDeadlines,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.blocks) && data.blocks.length > 0) {
        // Validate and clean up AI output
        const validBlocks: ScheduleBlock[] = data.blocks
          .filter((b: any) => b && b.startTime && b.endTime && b.activity)
          .map((b: any, index: number) => ({
            id: b.id || `ai-block-${index}-${Date.now()}`,
            startTime: b.startTime,
            endTime: b.endTime,
            activity: b.activity,
            type: (b.type || "task") as ScheduleBlockType,
            priority: b.priority as ImportanceLevel | undefined,
            deadlineId: b.deadlineId || undefined,
            subject: b.subject || undefined,
            reason: b.reason || undefined,
            location: b.location || undefined,
            isCompleted: false,
          }))
          .sort((a: ScheduleBlock, b: ScheduleBlock) => a.startTime.localeCompare(b.startTime));

        return { blocks: validBlocks, isAiGenerated: true };
      }
    }
  } catch (err) {
    console.warn("Server AI planner request failed, falling back to deterministic planner:", err);
  }

  // Graceful Deterministic Fallback Engine
  const fallbackBlocks = generateDeterministicSchedule(params);
  return { blocks: fallbackBlocks, isAiGenerated: false };
}

/**
 * Deterministic Algorithm:
 * 1. Places all fixed commitments (classes & events)
 * 2. Identifies free slots between preferences.startTime and preferences.endTime
 * 3. Never schedules prior to current time (no past scheduling)
 * 4. Sorts tasks by priority (Overdue > Due Today > Due Soon > Priority level)
 * 5. Packs work blocks into free slots and inserts realistic breaks
 */
export function generateDeterministicSchedule(params: BuildPlanParams): ScheduleBlock[] {
  const now = params.currentDate || new Date();
  const todayStr = formatDateToYYYYMMDD(now);
  const currentTimeMins = timeToMinutes(formatCurrentTimeHHMM(now));
  const todayDay = getTodayDayOfWeek(now);

  const {
    startTime: prefStart,
    endTime: prefEnd,
    sessionLengthMinutes = 50,
    breakLengthMinutes = 10,
  } = params.preferences;

  let windowStart = timeToMinutes(prefStart);
  const windowEnd = timeToMinutes(prefEnd);

  // Safety rule: Do not schedule tasks in the past.
  // If current time is past preferred start time, advance windowStart to current time (rounded up to nearest 5 min)
  if (currentTimeMins > windowStart) {
    windowStart = Math.ceil(currentTimeMins / 5) * 5;
  }

  if (windowStart >= windowEnd) {
    // If entire window has passed, show classes/events or return empty
    return [];
  }

  const resultBlocks: ScheduleBlock[] = [];

  // 1. Add Today's Classes
  const todayClasses = (params.timetable || []).filter((t) => t.day === todayDay);
  for (const c of todayClasses) {
    resultBlocks.push({
      id: `class-${c.id}`,
      startTime: c.startTime,
      endTime: c.endTime,
      activity: c.subject,
      type: "class",
      subject: c.subject,
      location: c.room || (c.instructor ? `With ${c.instructor}` : undefined),
      reason: "Scheduled class from weekly academic timetable",
    });
  }

  // 2. Add Today's Calendar Events
  const todayEvents = (params.events || []).filter(
    (ev) => ev && ev.date === todayStr && !ev.allDay && ev.startTime
  );
  for (const ev of todayEvents) {
    const evStart = ev.startTime || "10:00";
    const evEnd = ev.endTime || minutesToTime(timeToMinutes(evStart) + 60);
    resultBlocks.push({
      id: `event-${ev.id}`,
      startTime: evStart,
      endTime: evEnd,
      activity: ev.title,
      type: "event",
      location: ev.location,
      reason: `Event from calendar (${ev.category})`,
    });
  }

  // Sort fixed commitments by start time
  resultBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 3. Prioritize Active Deadlines
  const activeDeadlines = (params.deadlines || []).filter((d) => !d.completed);
  const scoredDeadlines = activeDeadlines.map((d) => {
    let score = 0;
    const reasons: string[] = [];

    const isOverdue = d.dueDate < todayStr;
    const isDueToday = d.dueDate === todayStr;

    if (isOverdue) {
      score += 1000;
      reasons.push("Overdue assignment — top priority");
    } else if (isDueToday) {
      score += 500;
      reasons.push(`Due today${d.dueTime ? ` by ${d.dueTime}` : ""}`);
    } else {
      try {
        const due = new Date(`${d.dueDate}T00:00:00`).getTime();
        const today = new Date(`${todayStr}T00:00:00`).getTime();
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 2) {
          score += 250;
          reasons.push(`Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`);
        } else if (diffDays <= 5) {
          score += 100;
          reasons.push(`Due in ${diffDays} days`);
        }
      } catch {}
    }

    switch (d.importance) {
      case "CRITICAL":
        score += 80;
        reasons.push("Critical priority");
        break;
      case "HIGH":
        score += 50;
        reasons.push("High priority");
        break;
      case "MEDIUM":
        score += 25;
        break;
      case "LOW":
        score += 10;
        break;
    }

    return {
      deadline: d,
      score,
      reason: reasons.join(" · ") || `Priority task for ${d.subject}`,
    };
  });

  scoredDeadlines.sort((a, b) => b.score - a.score);

  // 4. Calculate Free Slots
  interface TimeSlot {
    start: number;
    end: number;
  }
  const occupiedSlots: TimeSlot[] = resultBlocks.map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
  }));

  occupiedSlots.sort((a, b) => a.start - b.start);

  const freeSlots: TimeSlot[] = [];
  let currentPointer = windowStart;

  for (const occ of occupiedSlots) {
    if (occ.end <= currentPointer) continue; // Past commitment
    if (occ.start > currentPointer) {
      const gapEnd = Math.min(occ.start, windowEnd);
      if (gapEnd - currentPointer >= 20) {
        // Only consider gaps >= 20 minutes
        freeSlots.push({ start: currentPointer, end: gapEnd });
      }
    }
    currentPointer = Math.max(currentPointer, occ.end);
    if (currentPointer >= windowEnd) break;
  }

  if (currentPointer < windowEnd && windowEnd - currentPointer >= 20) {
    freeSlots.push({ start: currentPointer, end: windowEnd });
  }

  // 5. Fill Free Slots with Tasks and Breaks
  let taskIndex = 0;
  const newTasksAndBreaks: ScheduleBlock[] = [];

  for (const slot of freeSlots) {
    let slotTime = slot.start;

    while (slotTime + 20 <= slot.end && taskIndex < scoredDeadlines.length) {
      const { deadline, reason } = scoredDeadlines[taskIndex];
      const remainingInSlot = slot.end - slotTime;
      const sessionDuration = Math.min(sessionLengthMinutes, remainingInSlot);

      if (sessionDuration < 20) break; // Not enough time for a session

      const blockStart = minutesToTime(slotTime);
      const blockEnd = minutesToTime(slotTime + sessionDuration);

      newTasksAndBreaks.push({
        id: `task-plan-${deadline.id}-${Date.now()}-${taskIndex}`,
        startTime: blockStart,
        endTime: blockEnd,
        activity: deadline.taskName,
        type: "task",
        priority: deadline.importance,
        deadlineId: deadline.id,
        subject: deadline.subject,
        reason: `${reason} — allocated ${sessionDuration}m focus session`,
        isCompleted: false,
      });

      slotTime += sessionDuration;
      taskIndex++;

      // Insert break if there's enough time remaining in slot
      if (slot.end - slotTime >= breakLengthMinutes + 20) {
        const breakEnd = slotTime + breakLengthMinutes;
        newTasksAndBreaks.push({
          id: `break-${Date.now()}-${slotTime}`,
          startTime: minutesToTime(slotTime),
          endTime: minutesToTime(breakEnd),
          activity: "Recovery Break",
          type: "break",
          reason: `${breakLengthMinutes}m rest after focused academic work`,
        });
        slotTime = breakEnd;
      }
    }
  }

  // Combine and sort everything
  const finalSchedule = [...resultBlocks, ...newTasksAndBreaks].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  return finalSchedule;
}
