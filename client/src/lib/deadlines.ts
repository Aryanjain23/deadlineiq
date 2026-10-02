export type ImportanceLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DeadlineSource = "manual" | "ai";

export interface Deadline {
  id: string;
  taskName: string;
  subject: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm (24hr format)
  importance: ImportanceLevel;
  completed: boolean;
  createdAt: string; // ISO string
  source: DeadlineSource;
  updatedAt?: string;
  sourceType?: "manual" | "ai" | "imported";
  sourceId?: string;
  dateSource?: "ai-extracted" | "timetable-inferred" | "user-entered";
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  timetableDerived?: boolean;
}

const IMPORTANCE_WEIGHT: Record<ImportanceLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function getDeadlinesStorageKey(userKey: string): string {
  const cleanKey = (userKey || "default").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
  return `deadlineiq_deadlines_${cleanKey}`;
}

export function loadDeadlines(userKey: string): Deadline[] {
  try {
    const key = getDeadlinesStorageKey(userKey);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Deadline[];
    if (!Array.isArray(parsed)) return [];
    // Filter out any legacy test/demo items created during development
    return parsed.filter((d) => d && !d.id?.startsWith("demo-") && !d.id?.startsWith("sample-") && !d.id?.startsWith("test-"));
  } catch (error) {
    console.error("Failed to load deadlines:", error);
    return [];
  }
}

export function saveDeadlines(userKey: string, deadlines: Deadline[]): void {
  try {
    const key = getDeadlinesStorageKey(userKey);
    // Ensure no legacy demo items are preserved
    const sanitized = deadlines.filter((d) => d && !d.id?.startsWith("demo-") && !d.id?.startsWith("sample-") && !d.id?.startsWith("test-"));
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to save deadlines:", error);
  }
}

export function sortDeadlines(deadlines: Deadline[]): {
  active: Deadline[];
  completed: Deadline[];
  sortedAll: Deadline[];
} {
  const active = deadlines
    .filter((d) => !d.completed)
    .sort((a, b) => {
      // 1. Due date & time (chronological)
      const dateA = a.dueDate + (a.dueTime ? `T${a.dueTime}` : "T23:59:59");
      const dateB = b.dueDate + (b.dueTime ? `T${b.dueTime}` : "T23:59:59");
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      // 2. Importance (Critical -> High -> Med -> Low)
      return IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance];
    });

  const completed = deadlines
    .filter((d) => d.completed)
    .sort((a, b) => {
      // Most recently created/due first
      const dateA = a.dueDate + (a.dueTime ? `T${a.dueTime}` : "T23:59:59");
      const dateB = b.dueDate + (b.dueTime ? `T${b.dueTime}` : "T23:59:59");
      return dateB.localeCompare(dateA);
    });

  return {
    active,
    completed,
    sortedAll: [...active, ...completed],
  };
}

export function calculateStats(deadlines: Deadline[]) {
  const today = new Date().toISOString().split("T")[0];
  const inTwoDays = new Date();
  inTwoDays.setDate(inTwoDays.getDate() + 2);
  const inTwoDaysStr = inTwoDays.toISOString().split("T")[0];

  const active = deadlines.filter((d) => !d.completed);
  const completed = deadlines.filter((d) => d.completed);

  const dueSoon = active.filter((d) => {
    return d.dueDate <= inTwoDaysStr;
  });

  const highPriority = active.filter(
    (d) => d.importance === "HIGH" || d.importance === "CRITICAL"
  );

  return {
    activeCount: active.length,
    dueSoonCount: dueSoon.length,
    completedCount: completed.length,
    highPriorityCount: highPriority.length,
  };
}

export function formatDueDateTime(dueDate: string, dueTime?: string): string {
  if (!dueDate) return "";

  const [year, month, day] = dueDate.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let datePrefix = "";
  if (targetDate.getTime() === today.getTime()) {
    datePrefix = "Due today";
  } else if (targetDate.getTime() === tomorrow.getTime()) {
    datePrefix = "Due tomorrow";
  } else if (targetDate.getTime() === yesterday.getTime()) {
    datePrefix = "Overdue (Yesterday)";
  } else if (targetDate.getTime() < today.getTime()) {
    datePrefix = `Overdue (${targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
  } else {
    datePrefix = `Due ${targetDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  }

  if (dueTime) {
    const [hours, minutes] = dueTime.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${datePrefix} · ${displayHour}:${displayMinutes} ${period}`;
  }

  return datePrefix;
}
