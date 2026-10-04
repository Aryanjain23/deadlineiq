import type { Deadline, ImportanceLevel } from "./deadlines";
import type { TimetableEntry, DayOfWeek } from "./timetable";
import type { CalendarEvent } from "./calendar";
import type { Exam } from "./exams";
import type {
  ScheduleBlock,
  ScheduleBlockType,
  PlanPreferences,
} from "./firebase/types";

export interface BuildPlanParams {
  deadlines: Deadline[];
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  exams?: Exam[];
  preferences: PlanPreferences;
  currentDate?: Date; // Defaults to now
  planFreeTimeAnyway?: boolean;
}

export function computeDynamicWindowPreferences(now: Date = new Date()): PlanPreferences {
  const currentHHMM = formatCurrentTimeHHMM(now);
  const startMins = timeToMinutes(currentHHMM);
  const endMinsTotal = startMins + 9 * 60; // 9-hour default horizon
  const endHHMM = minutesToTime(endMinsTotal % (24 * 60));
  return {
    startTime: currentHHMM,
    endTime: endHHMM,
    sessionLengthMinutes: 50,
    breakLengthMinutes: 10,
  };
}

export const DEFAULT_PLAN_PREFERENCES: PlanPreferences = computeDynamicWindowPreferences();

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

/**
 * Helper to compute continuous minute offset from window start,
 * properly handling cross-midnight time ranges.
 */
export function getOffsetMinutesFromWindowStart(timeStr: string, windowStartMins: number): number {
  const m = timeToMinutes(timeStr);
  return m < windowStartMins ? m + 1440 : m;
}

/**
 * Calculates human-readable duration between two HH:mm strings.
 * e.g. "45 min", "1 hr", "1 hr 15 min"
 */
export function formatBlockDuration(startTime: string, endTime: string): string {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const diff = Math.max(0, endMins - startMins);

  if (diff <= 0) return "0 min";
  if (diff < 60) return `${diff} min`;

  const hours = Math.floor(diff / 60);
  const remainingMins = diff % 60;

  if (remainingMins === 0) {
    return hours === 1 ? "1 hr" : `${hours} hrs`;
  }
  return `${hours} hr ${remainingMins} min`;
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
 * Clean, concise reasons for plan items
 */
export function cleanReasonText(reason?: string): string | undefined {
  if (!reason) return undefined;
  const trimmed = reason.trim();
  if (!trimmed) return undefined;

  // Filter out redundant technical sentences
  if (
    trimmed.toLowerCase().includes("contextual schedule") ||
    trimmed.toLowerCase().includes("weekly academic timetable") ||
    trimmed.toLowerCase().includes("session duration") ||
    trimmed.toLowerCase().includes("deterministic planner")
  ) {
    return undefined;
  }
  return trimmed;
}

/**
 * Generates a context-aware intelligent schedule for today via AI backend,
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
  const completedDeadlines = (params.deadlines || []).filter((d) => d.completed).slice(0, 10);
  const allExams = params.exams || [];

  const timeZone = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  // Compute strict ISO start/end window for planning
  const startMins = timeToMinutes(params.preferences.startTime);
  const endMins = timeToMinutes(params.preferences.endTime);

  const planningStart = new Date(now);
  planningStart.setHours(Math.floor(startMins / 60), startMins % 60, 0, 0);

  const planningEnd = new Date(planningStart);
  if (endMins <= startMins) {
    planningEnd.setDate(planningEnd.getDate() + 1);
  }
  planningEnd.setHours(Math.floor(endMins / 60), endMins % 60, 0, 0);

  // 1. Gather Remaining Fixed Commitments for Today (filtering out past commitments)
  const todayClasses = (params.timetable || []).filter((t) => t.day === todayDay && t.endTime >= currentTimeStr);
  const todayEvents = (params.events || []).filter(
    (ev) => ev && ev.date === todayStr && !ev.allDay && (!ev.endTime || ev.endTime >= currentTimeStr)
  );
  const todayExams = allExams.filter((ex) => ex.examDate === todayStr && (!ex.endTime || ex.endTime >= currentTimeStr));

  // 2. Upcoming Exams (Next 14-30 Days)
  const upcomingExams = allExams
    .filter((ex) => ex.examDate >= todayStr)
    .map((ex) => {
      let daysUntil = 0;
      try {
        const examTime = new Date(`${ex.examDate}T00:00:00`).getTime();
        const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
        daysUntil = Math.max(0, Math.round((examTime - todayTime) / (1000 * 60 * 60 * 24)));
      } catch {}
      return {
        id: ex.id,
        subject: ex.subject,
        subjectCode: ex.subjectCode,
        examDate: ex.examDate,
        startTime: ex.startTime,
        endTime: ex.endTime,
        examType: ex.examType,
        daysUntil,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // 3. Extract Unique User Enrolled Subjects / Courses
  const subjectSet = new Set<string>();
  (params.timetable || []).forEach((t) => t.subject && subjectSet.add(t.subject.trim()));
  (params.deadlines || []).forEach((d) => d.subject && subjectSet.add(d.subject.trim()));
  allExams.forEach((e) => e.subject && subjectSet.add(e.subject.trim()));
  const userSubjects = Array.from(subjectSet).filter(Boolean);

  // If user has zero data and hasn't requested free time planning, return empty
  const hasAcademicData =
    activeDeadlines.length > 0 ||
    todayClasses.length > 0 ||
    todayEvents.length > 0 ||
    todayExams.length > 0 ||
    upcomingExams.length > 0 ||
    userSubjects.length > 0;

  if (!hasAcademicData && !params.planFreeTimeAnyway) {
    return { blocks: [], isAiGenerated: false };
  }

  // Build Payload for AI API
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
    ...todayExams.map((ex) => ({
      id: `exam-${ex.id}`,
      title: `${ex.subject} ${ex.examType || "Exam"}`,
      startTime: ex.startTime || "10:00",
      endTime: ex.endTime || minutesToTime(timeToMinutes(ex.startTime || "10:00") + 180),
      type: "event" as const,
      location: ex.room || "Exam Hall",
      subject: ex.subject,
    })),
  ];

  const payloadDeadlines = activeDeadlines.map((d) => {
    const isOverdue = d.dueDate < todayStr;
    const isDueToday = d.dueDate === todayStr;
    let isDueSoon = false;
    let daysDiff = 0;
    try {
      const due = new Date(`${d.dueDate}T00:00:00`).getTime();
      const today = new Date(`${todayStr}T00:00:00`).getTime();
      daysDiff = Math.round((due - today) / (1000 * 60 * 60 * 24));
      isDueSoon = daysDiff > 0 && daysDiff <= 2;
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
      daysDiff,
    };
  });

  const payloadCompleted = completedDeadlines.map((d) => ({
    id: d.id,
    taskName: d.taskName,
    subject: d.subject,
    completedAt: d.updatedAt,
  }));

  // Try AI API
  try {
    const res = await fetch("/api/plan-my-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentDate: todayStr,
        currentTime: currentTimeStr,
        currentIsoTimestamp: now.toISOString(),
        timeZone,
        planningStartIso: planningStart.toISOString(),
        planningEndIso: planningEnd.toISOString(),
        preferences: params.preferences,
        fixedCommitments,
        activeDeadlines: payloadDeadlines,
        upcomingExams,
        completedTasks: payloadCompleted,
        userSubjects,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.blocks) && data.blocks.length > 0) {
        const startMins = timeToMinutes(currentTimeStr);
        const validBlocks: ScheduleBlock[] = data.blocks
          .filter((b: any) => {
            if (!b || !b.startTime || !b.endTime || !b.activity) return false;
            const bStart = getOffsetMinutesFromWindowStart(b.startTime, startMins);
            // Must begin at or after current time, and within the 9-hour window (+ buffer)
            return bStart >= startMins && bStart <= startMins + 9 * 60 + 45;
          })
          .map((b: any, index: number) => ({
            id: b.id || `ai-block-${index}-${Date.now()}`,
            startTime: b.startTime,
            endTime: b.endTime,
            activity: b.activity,
            type: (b.type || "task") as ScheduleBlockType,
            priority: b.priority as ImportanceLevel | undefined,
            deadlineId: b.deadlineId || undefined,
            subject: b.subject || undefined,
            reason: cleanReasonText(b.reason),
            location: b.location || undefined,
            isAiRecommendation: Boolean(
              b.isAiRecommendation ||
              b.type === "revision" ||
              b.type === "skill" ||
              b.type === "review" ||
              b.type === "organize"
            ),
            isCompleted: false,
          }))
          .sort(
            (a: ScheduleBlock, b: ScheduleBlock) =>
              getOffsetMinutesFromWindowStart(a.startTime, startMins) -
              getOffsetMinutesFromWindowStart(b.startTime, startMins)
          );

        return { blocks: validBlocks, isAiGenerated: true };
      }
    }
  } catch (err) {
    console.warn("Server AI planner request failed, falling back to deterministic planner:", err);
  }

  // Fallback to rich deterministic planner
  const fallbackBlocks = generateDeterministicSchedule(params);
  return { blocks: fallbackBlocks, isAiGenerated: false };
}

/**
 * Context-Aware Deterministic Algorithm:
 * 1. Places all fixed commitments (classes, today's exams & events)
 * 2. Identifies free slots between preferences.startTime and preferences.endTime
 * 3. Never schedules in the past
 * 4. Fills free time based on hierarchy:
 *    - Priority 1: Overdue & due-today deadlines
 *    - Priority 2: Upcoming exam revisions (exams within 14-30 days)
 *    - Priority 3: Subject reviews & technical skills for enrolled courses
 *    - Priority 4: Intelligent free time suggestions (skill learning, workspace organization, walks, breaks)
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

  let startMins = timeToMinutes(prefStart);
  let endMins = timeToMinutes(prefEnd);
  if (endMins <= startMins) {
    endMins += 24 * 60; // Spans across midnight
  }
  const windowEnd = endMins;
  let windowStart = Math.max(startMins, currentTimeMins);
  if (windowStart >= endMins) {
    return [];
  }

  const resultBlocks: ScheduleBlock[] = [];

  // 1. Add Today's Classes (Filtered strictly to window: no past classes)
  const todayClasses = (params.timetable || []).filter((t) => t.day === todayDay);
  for (const c of todayClasses) {
    const cStartOffset = getOffsetMinutesFromWindowStart(c.startTime, windowStart);
    let cEndOffset = getOffsetMinutesFromWindowStart(c.endTime, windowStart);
    if (cEndOffset <= cStartOffset) cEndOffset += 1440;

    // Ignore classes that ended before windowStart or begin after windowEnd
    if (cEndOffset <= windowStart || cStartOffset >= windowEnd) continue;

    const effectiveStartMins = Math.max(cStartOffset, windowStart);
    const effectiveEndMins = Math.min(cEndOffset, windowEnd);
    if (effectiveEndMins - effectiveStartMins < 10) continue;

    resultBlocks.push({
      id: `class-${c.id}`,
      startTime: minutesToTime(effectiveStartMins % 1440),
      endTime: minutesToTime(effectiveEndMins % 1440),
      activity: c.subject,
      type: "class",
      subject: c.subject,
      location: c.room || (c.instructor ? `With ${c.instructor}` : undefined),
      reason: undefined,
      isAiRecommendation: false,
    });
  }

  // 2. Add Today's Exams (Filtered strictly to window)
  const todayExams = (params.exams || []).filter((e) => e.examDate === todayStr);
  for (const ex of todayExams) {
    const exStart = ex.startTime || "10:00";
    const exEnd = ex.endTime || minutesToTime(timeToMinutes(exStart) + 180);
    const exStartOffset = getOffsetMinutesFromWindowStart(exStart, windowStart);
    let exEndOffset = getOffsetMinutesFromWindowStart(exEnd, windowStart);
    if (exEndOffset <= exStartOffset) exEndOffset += 1440;

    if (exEndOffset <= windowStart || exStartOffset >= windowEnd) continue;

    const effectiveStartMins = Math.max(exStartOffset, windowStart);
    const effectiveEndMins = Math.min(exEndOffset, windowEnd);

    resultBlocks.push({
      id: `exam-${ex.id}`,
      startTime: minutesToTime(effectiveStartMins % 1440),
      endTime: minutesToTime(effectiveEndMins % 1440),
      activity: `${ex.subject} Examination`,
      type: "event",
      subject: ex.subject,
      location: ex.room || "Examination Hall",
      reason: "Exam today",
      isAiRecommendation: false,
    });
  }

  // 3. Add Today's Calendar Events (Filtered strictly to window)
  const todayEvents = (params.events || []).filter(
    (ev) => ev && ev.date === todayStr && !ev.allDay && ev.startTime
  );
  for (const ev of todayEvents) {
    const evStart = ev.startTime || "10:00";
    const evEnd = ev.endTime || minutesToTime(timeToMinutes(evStart) + 60);
    const evStartOffset = getOffsetMinutesFromWindowStart(evStart, windowStart);
    let evEndOffset = getOffsetMinutesFromWindowStart(evEnd, windowStart);
    if (evEndOffset <= evStartOffset) evEndOffset += 1440;

    if (evEndOffset <= windowStart || evStartOffset >= windowEnd) continue;

    const effectiveStartMins = Math.max(evStartOffset, windowStart);
    const effectiveEndMins = Math.min(evEndOffset, windowEnd);

    resultBlocks.push({
      id: `event-${ev.id}`,
      startTime: minutesToTime(effectiveStartMins % 1440),
      endTime: minutesToTime(effectiveEndMins % 1440),
      activity: ev.title,
      type: "event",
      location: ev.location,
      reason: undefined,
      isAiRecommendation: false,
    });
  }

  resultBlocks.sort(
    (a, b) =>
      getOffsetMinutesFromWindowStart(a.startTime, windowStart) -
      getOffsetMinutesFromWindowStart(b.startTime, windowStart)
  );

  // 4. Gather Candidate Study & Free-Time Activities
  interface CandidateActivity {
    activity: string;
    type: ScheduleBlockType;
    priority?: ImportanceLevel;
    deadlineId?: string;
    subject?: string;
    reason?: string;
    score: number;
    isAiRecommendation: boolean;
  }

  const candidatePool: CandidateActivity[] = [];

  // A. Active Deadlines
  const activeDeadlines = (params.deadlines || []).filter((d) => !d.completed);
  for (const d of activeDeadlines) {
    let score = 0;
    let reasonText = "";

    const isOverdue = d.dueDate < todayStr;
    const isDueToday = d.dueDate === todayStr;

    if (isOverdue) {
      score += 1200;
      reasonText = "Overdue";
    } else if (isDueToday) {
      score += 800;
      reasonText = d.dueTime ? `Due today at ${d.dueTime}` : "Due today";
    } else {
      try {
        const due = new Date(`${d.dueDate}T00:00:00`).getTime();
        const today = new Date(`${todayStr}T00:00:00`).getTime();
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          score += 500;
          reasonText = "Due tomorrow";
        } else if (diffDays <= 3) {
          score += 350;
          reasonText = `Due in ${diffDays} days`;
        } else if (diffDays <= 7) {
          score += 200;
          reasonText = `Due in ${diffDays} days`;
        } else {
          score += 80;
          reasonText = "Upcoming deadline";
        }
      } catch {
        reasonText = "Active task";
      }
    }

    if (d.importance === "CRITICAL") score += 100;
    else if (d.importance === "HIGH") score += 60;
    else if (d.importance === "MEDIUM") score += 30;

    candidatePool.push({
      activity: d.taskName,
      type: "task",
      priority: d.importance,
      deadlineId: d.id,
      subject: d.subject,
      reason: reasonText || undefined,
      score,
      isAiRecommendation: false,
    });
  }

  // B. Upcoming Exams Revision
  const upcomingExams = (params.exams || []).filter((e) => e.examDate > todayStr);
  const subjectsWithDeadlines = new Set(activeDeadlines.map((d) => d.subject.trim().toLowerCase()));

  for (const ex of upcomingExams) {
    let daysUntil = 14;
    try {
      const examTime = new Date(`${ex.examDate}T00:00:00`).getTime();
      const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
      daysUntil = Math.max(1, Math.round((examTime - todayTime) / (1000 * 60 * 60 * 24)));
    } catch {}

    if (daysUntil <= 21) {
      const hasTask = subjectsWithDeadlines.has(ex.subject.trim().toLowerCase());
      const score = 650 - daysUntil * 25 + (hasTask ? 0 : 50);

      candidatePool.push({
        activity: `${ex.subject} revision`,
        type: "revision",
        priority: daysUntil <= 3 ? "CRITICAL" : daysUntil <= 7 ? "HIGH" : "MEDIUM",
        subject: ex.subject,
        reason: daysUntil === 1 ? "Exam tomorrow" : `Exam in ${daysUntil} days`,
        score,
        isAiRecommendation: true,
      });
    }
  }

  // C. Subject Reviews for Enrolled Courses with No Active Tasks
  const allSubjectSet = new Set<string>();
  (params.timetable || []).forEach((t) => t.subject && allSubjectSet.add(t.subject.trim()));
  (params.exams || []).forEach((e) => e.subject && allSubjectSet.add(e.subject.trim()));

  for (const subj of Array.from(allSubjectSet)) {
    const hasDeadline = subjectsWithDeadlines.has(subj.toLowerCase());
    const hasUpcomingExam = upcomingExams.some((e) => e.subject.trim().toLowerCase() === subj.toLowerCase());

    if (!hasDeadline && !hasUpcomingExam) {
      candidatePool.push({
        activity: `${subj} revision & problem solving`,
        type: "review",
        priority: "MEDIUM",
        subject: subj,
        reason: "Subject review",
        score: 150,
        isAiRecommendation: true,
      });

      candidatePool.push({
        activity: `Practice technical exercises: ${subj}`,
        type: "skill",
        priority: "LOW",
        subject: subj,
        reason: "Skill practice",
        score: 120,
        isAiRecommendation: true,
      });
    }
  }

  // D. Free-Time Suggestions when user requests plan or has extra time
  if (candidatePool.length === 0 || params.planFreeTimeAnyway) {
    candidatePool.push(
      {
        activity: "Technical skill practice & coding",
        type: "skill",
        priority: "MEDIUM",
        reason: "Learn a new skill",
        score: 90,
        isAiRecommendation: true,
      },
      {
        activity: "Review recent lecture notes",
        type: "review",
        priority: "LOW",
        reason: "Study review",
        score: 80,
        isAiRecommendation: true,
      },
      {
        activity: "Organize upcoming academic work & workspace",
        type: "organize",
        priority: "LOW",
        reason: "Organization",
        score: 70,
        isAiRecommendation: true,
      },
      {
        activity: "Walk or physical exercise break",
        type: "break",
        reason: "Rest & recharge",
        score: 60,
        isAiRecommendation: true,
      }
    );
  }

  // Sort candidate pool by score descending
  candidatePool.sort((a, b) => b.score - a.score);

  // 5. Calculate Free Slots
  interface TimeSlot {
    start: number;
    end: number;
  }
  const occupiedSlots: TimeSlot[] = resultBlocks.map((b) => {
    const s = getOffsetMinutesFromWindowStart(b.startTime, windowStart);
    let e = getOffsetMinutesFromWindowStart(b.endTime, windowStart);
    if (e <= s) e += 1440;
    return { start: s, end: e };
  });

  occupiedSlots.sort((a, b) => a.start - b.start);

  const freeSlots: TimeSlot[] = [];
  let currentPointer = windowStart;

  for (const occ of occupiedSlots) {
    if (occ.end <= currentPointer) continue;
    if (occ.start > currentPointer) {
      const gapEnd = Math.min(occ.start, windowEnd);
      if (gapEnd - currentPointer >= 20) {
        freeSlots.push({ start: currentPointer, end: gapEnd });
      }
    }
    currentPointer = Math.max(currentPointer, occ.end);
    if (currentPointer >= windowEnd) break;
  }

  if (currentPointer < windowEnd && windowEnd - currentPointer >= 20) {
    freeSlots.push({ start: currentPointer, end: windowEnd });
  }

  // 6. Fill Free Slots with Study/Revision/Skill Blocks and Breaks
  let itemIndex = 0;
  const scheduledActivities: ScheduleBlock[] = [];

  for (const slot of freeSlots) {
    let slotTime = slot.start;

    while (slotTime + 20 <= slot.end && itemIndex < candidatePool.length) {
      const candidate = candidatePool[itemIndex];
      const remainingInSlot = slot.end - slotTime;
      const sessionDuration = Math.min(sessionLengthMinutes, remainingInSlot);

      if (sessionDuration < 20) break;

      const blockStart = minutesToTime(slotTime % 1440);
      const blockEnd = minutesToTime((slotTime + sessionDuration) % 1440);

      scheduledActivities.push({
        id: `plan-${candidate.type}-${Date.now()}-${itemIndex}`,
        startTime: blockStart,
        endTime: blockEnd,
        activity: candidate.activity,
        type: candidate.type,
        priority: candidate.priority,
        deadlineId: candidate.deadlineId,
        subject: candidate.subject,
        reason: candidate.reason,
        isAiRecommendation: candidate.isAiRecommendation,
        isCompleted: false,
      });

      slotTime += sessionDuration;
      itemIndex++;

      // Insert break if ample time remains in this slot
      if (slot.end - slotTime >= breakLengthMinutes + 25) {
        const breakEnd = slotTime + breakLengthMinutes;
        scheduledActivities.push({
          id: `break-${Date.now()}-${slotTime}`,
          startTime: minutesToTime(slotTime % 1440),
          endTime: minutesToTime(breakEnd % 1440),
          activity: "Break",
          type: "break",
          reason: undefined,
          isAiRecommendation: false,
        });
        slotTime = breakEnd;
      }
    }
  }

  // Combine and sort chronologically using continuous offset from windowStart
  return [...resultBlocks, ...scheduledActivities].sort(
    (a, b) =>
      getOffsetMinutesFromWindowStart(a.startTime, windowStart) -
      getOffsetMinutesFromWindowStart(b.startTime, windowStart)
  );
}


export interface ActivePlanStateResult {
  status: "ACTIVE" | "UPCOMING" | "COMPLETED" | "EMPTY";
  activeBlock: ScheduleBlock | null;
  nextBlock: ScheduleBlock | null;
  upNextBlocks: ScheduleBlock[];
  remainingTimeStr: string | null;
}

export function evaluateActivePlanState(
  blocks: ScheduleBlock[] = [],
  now: Date = new Date()
): ActivePlanStateResult {
  if (!blocks || blocks.length === 0) {
    return {
      status: "EMPTY",
      activeBlock: null,
      nextBlock: null,
      upNextBlocks: [],
      remainingTimeStr: null,
    };
  }

  const currentHHMM = formatCurrentTimeHHMM(now);
  const currentMins = timeToMinutes(currentHHMM);
  const refStartMins = timeToMinutes(blocks[0].startTime);
  const currentOffset = getOffsetMinutesFromWindowStart(currentHHMM, refStartMins);

  let activeBlock: ScheduleBlock | null = null;
  let nextBlock: ScheduleBlock | null = null;
  const upNextBlocks: ScheduleBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const startM = getOffsetMinutesFromWindowStart(b.startTime, refStartMins);
    let endM = getOffsetMinutesFromWindowStart(b.endTime, refStartMins);
    if (endM <= startM) endM += 1440;

    if (currentOffset >= startM && currentOffset < endM && !activeBlock) {
      activeBlock = b;
    } else if (startM > currentOffset) {
      if (!nextBlock) {
        nextBlock = b;
      } else {
        upNextBlocks.push(b);
      }
    }
  }

  let remainingTimeStr: string | null = null;
  if (activeBlock) {
    const startM = getOffsetMinutesFromWindowStart(activeBlock.startTime, refStartMins);
    let endM = getOffsetMinutesFromWindowStart(activeBlock.endTime, refStartMins);
    if (endM <= startM) endM += 1440;
    const diff = Math.max(0, endM - currentOffset);
    if (diff < 60) {
      remainingTimeStr = diff + "m left";
    } else {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      remainingTimeStr = h + "h " + m + "m left";
    }
  }

  const allCompleted = blocks.every((b) => b.isCompleted);
  const lastBlock = blocks[blocks.length - 1];
  let lastEndOffset = 0;
  if (lastBlock) {
    const s = getOffsetMinutesFromWindowStart(lastBlock.startTime, refStartMins);
    lastEndOffset = getOffsetMinutesFromWindowStart(lastBlock.endTime, refStartMins);
    if (lastEndOffset <= s) lastEndOffset += 1440;
  }
  const isPastAllBlocks = currentOffset >= lastEndOffset;

  if (allCompleted || (isPastAllBlocks && !activeBlock && !nextBlock)) {
    return {
      status: "COMPLETED",
      activeBlock: null,
      nextBlock: null,
      upNextBlocks: [],
      remainingTimeStr: null,
    };
  }

  if (activeBlock) {
    return {
      status: "ACTIVE",
      activeBlock,
      nextBlock,
      upNextBlocks,
      remainingTimeStr,
    };
  }

  if (nextBlock) {
    return {
      status: "UPCOMING",
      activeBlock: null,
      nextBlock,
      upNextBlocks,
      remainingTimeStr: null,
    };
  }

  return {
    status: "EMPTY",
    activeBlock: null,
    nextBlock: null,
    upNextBlocks: [],
    remainingTimeStr: null,
  };
}
