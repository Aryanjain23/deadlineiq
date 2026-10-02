import type { Deadline, ImportanceLevel } from "./deadlines";
import type { Exam } from "./exams";
import { getDaysUntil, formatExamDateDisplay } from "./exams";
import type { TimetableEntry, NextClassResult } from "./timetable";
import { getNextClassForSubject } from "./timetable";

export type UrgencyTier = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export interface PlannerRecommendation {
  deadline: Deadline;
  score: number;
  urgencyTier: UrgencyTier;
  reasons: string[];
  daysRemaining: number;
  relatedExam?: Exam;
  nextClass?: NextClassResult;
  clusterCount: number;
}

/**
 * Calculates deterministic client-side smart priority scores
 * for active (uncompleted) deadlines considering due date, priority,
 * upcoming exams in the same subject, class timetable, and workload clustering.
 */
export function calculateSmartRecommendations(
  deadlines: Deadline[],
  exams: Exam[],
  timetable: TimetableEntry[]
): PlannerRecommendation[] {
  const activeDeadlines = deadlines.filter((d) => !d.completed);
  if (activeDeadlines.length === 0) return [];

  // Pre-calculate date clusters (count of tasks due on same date)
  const dateCounts = new Map<string, number>();
  for (const d of activeDeadlines) {
    dateCounts.set(d.dueDate, (dateCounts.get(d.dueDate) || 0) + 1);
  }

  const scored: PlannerRecommendation[] = activeDeadlines.map((deadline) => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Due Date Urgency
    const days = getDaysUntil(deadline.dueDate);

    if (days < 0) {
      score += 55;
      reasons.push("Overdue — requires immediate attention");
    } else if (days === 0) {
      score += 48;
      reasons.push("Due today");
    } else if (days === 1) {
      score += 38;
      reasons.push("Due tomorrow");
    } else if (days === 2) {
      score += 26;
      reasons.push("Due in 2 days");
    } else if (days <= 4) {
      score += 18;
      reasons.push(`Due in ${days} days`);
    } else if (days <= 7) {
      score += 10;
      reasons.push("Due this week");
    } else {
      score += 4;
    }

    // 2. Importance / Priority
    switch (deadline.importance) {
      case "CRITICAL":
        score += 40;
        reasons.push("Critical priority level");
        break;
      case "HIGH":
        score += 26;
        reasons.push("High priority");
        break;
      case "MEDIUM":
        score += 14;
        break;
      case "LOW":
        score += 5;
        break;
    }

    // 3. Approaching Exam in the same subject
    const subjectClean = deadline.subject.trim().toLowerCase();
    const relatedExams = exams.filter((ex) => {
      const exSub = ex.subject.trim().toLowerCase();
      const codeMatch = ex.subjectCode && subjectClean.includes(ex.subjectCode.toLowerCase());
      return exSub === subjectClean || subjectClean.includes(exSub) || exSub.includes(subjectClean) || codeMatch;
    });

    let nearestRelatedExam: Exam | undefined;
    let minExamDays = Infinity;

    for (const ex of relatedExams) {
      const exDays = getDaysUntil(ex.examDate);
      if (exDays >= 0 && exDays < minExamDays) {
        minExamDays = exDays;
        nearestRelatedExam = ex;
      }
    }

    if (nearestRelatedExam && minExamDays <= 14) {
      if (minExamDays <= 2) {
        score += 35;
        const dayLabel = minExamDays === 0 ? "today" : minExamDays === 1 ? "tomorrow" : "in 2 days";
        reasons.push(`${nearestRelatedExam.subject} ${nearestRelatedExam.examType} Exam is ${dayLabel}`);
      } else if (minExamDays <= 7) {
        score += 24;
        reasons.push(`${nearestRelatedExam.subject} exam is approaching in ${minExamDays} days`);
      } else {
        score += 12;
        reasons.push(`Upcoming ${nearestRelatedExam.subject} exam preparation horizon`);
      }
    }

    // 4. Related Upcoming Class
    const nextClass = getNextClassForSubject(timetable, deadline.subject);
    if (nextClass) {
      if (nextClass.relativeDays === 0) {
        score += 22;
        reasons.push(`${deadline.subject} class is scheduled for today`);
      } else if (nextClass.relativeDays === 1) {
        score += 18;
        reasons.push(`${deadline.subject} class is approaching tomorrow (${nextClass.dayOfWeek})`);
      } else if (nextClass.relativeDays <= 3) {
        score += 10;
        reasons.push(`${deadline.subject} class on ${nextClass.dayOfWeek}`);
      }
    }

    // 5. Workload Clustering
    const cluster = (dateCounts.get(deadline.dueDate) || 1) - 1;
    if (cluster >= 2) {
      score += 14;
      reasons.push(`High workload cluster: ${cluster} other tasks due around same time`);
    } else if (cluster === 1) {
      score += 6;
      reasons.push("Multiple assignments due on this date");
    }

    // Determine Urgency Tier
    let urgencyTier: UrgencyTier;
    if (score >= 70 || days <= 1 || deadline.importance === "CRITICAL") {
      urgencyTier = "URGENT";
    } else if (score >= 48 || days <= 3 || deadline.importance === "HIGH") {
      urgencyTier = "HIGH";
    } else if (score >= 28) {
      urgencyTier = "MEDIUM";
    } else {
      urgencyTier = "LOW";
    }

    // Ensure we have at least 2 clear, scannable reasons
    if (reasons.length === 0) {
      reasons.push(`Scheduled for ${deadline.subject}`);
      reasons.push("Pending academic requirement");
    } else if (reasons.length === 1) {
      if (deadline.importance !== "LOW") {
        reasons.push(`Designated as ${deadline.importance.toLowerCase()} priority`);
      } else {
        reasons.push(`Standard coursework for ${deadline.subject}`);
      }
    }

    return {
      deadline,
      score,
      urgencyTier,
      reasons: reasons.slice(0, 3), // Max 3 concise bullet points for clean UI
      daysRemaining: days,
      relatedExam: nearestRelatedExam,
      nextClass: nextClass || undefined,
      clusterCount: cluster,
    };
  });

  // Sort descending by score, tie-break by days remaining ascending, then time
  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    const timeA = a.deadline.dueTime || "23:59";
    const timeB = b.deadline.dueTime || "23:59";
    return timeA.localeCompare(timeB);
  });
}
