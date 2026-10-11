import type { Deadline } from "./deadlines";
import type { Exam } from "./exams";

export type NotificationPermissionStatus =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

const SENT_NOTIFICATIONS_STORAGE_KEY = "deadlineiq_sent_notifications";

/**
 * Checks whether Notification API is supported by the current environment.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Retrieves the current notification permission state.
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (!isNotificationSupported()) {
    return "unsupported";
  }
  return Notification.permission as NotificationPermissionStatus;
}

/**
 * Requests browser/system notification permissions with explicit user interaction.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNotificationSupported()) {
    return "unsupported";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermissionStatus;
  } catch (err) {
    console.warn("Error requesting notification permission:", err);
    return Notification.permission as NotificationPermissionStatus;
  }
}

/**
 * Retrieves loaded sent notification tracking map with automatic 14-day expiry cleanup.
 */
function getSentNotificationsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SENT_NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const cleaned: Record<string, number> = {};

    for (const [key, timestamp] of Object.entries(parsed)) {
      if (typeof timestamp === "number" && now - timestamp < fourteenDaysMs) {
        cleaned[key] = timestamp;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

/**
 * Records that a specific notification has been dispatched to prevent duplicate reminders.
 */
function recordSentNotification(key: string): void {
  try {
    const map = getSentNotificationsMap();
    map[key] = Date.now();
    localStorage.setItem(SENT_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("Failed to record sent notification:", err);
  }
}

/**
 * Dispatches a notification through an active Service Worker registration (ideal for Android PWA),
 * falling back to window.Notification if the Service Worker is unavailable.
 */
export async function showLocalNotification(
  title: string,
  options: NotificationOptions = {}
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return false;
  }

  const notificationOptions: NotificationOptions = {
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    ...options,
  };

  // Try service worker registration first (handles Android PWA background & foreground)
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && "showNotification" in registration) {
        await registration.showNotification(title, notificationOptions);
        return true;
      }
    } catch (swErr) {
      console.warn("ServiceWorker showNotification fallback:", swErr);
    }
  }

  // Fallback to standard window Notification
  try {
    new Notification(title, notificationOptions);
    return true;
  } catch (err) {
    console.warn("Window Notification dispatch failed:", err);
    return false;
  }
}

/**
 * Triggers an immediate test reminder to verify that notification display works on this device.
 */
export async function sendTestNotification(): Promise<{
  success: boolean;
  message: string;
}> {
  if (!isNotificationSupported()) {
    return {
      success: false,
      message: "Notifications are not supported by this browser.",
    };
  }

  let permission = getNotificationPermission();
  if (permission === "default") {
    permission = await requestNotificationPermission();
  }

  if (permission !== "granted") {
    return {
      success: false,
      message:
        permission === "denied"
          ? "Notification permission is blocked. Please allow notifications in your browser/Android site settings."
          : "Notification permission was not granted.",
    };
  }

  const dispatched = await showLocalNotification("DeadlineIQ Test Reminder", {
    body: "Notifications are working properly! You will receive timely alerts for deadlines and exams.",
    tag: `test-reminder-${Date.now()}`,
  });

  if (dispatched) {
    return {
      success: true,
      message: "Test reminder sent! Check your notification tray.",
    };
  }

  return {
    success: false,
    message: "Could not display test notification. Please verify system notification settings.",
  };
}

export interface NotificationPreferences {
  deadlineAlerts?: boolean;
  examAlerts?: boolean;
  dailyPlanReminder?: boolean;
}

/**
 * Evaluates active deadlines and exams against the current local time,
 * firing 24h and 3h warnings while strictly preventing duplicates.
 */
export async function evaluateDeadlinesAndNotify(
  deadlines: Deadline[],
  exams: Exam[],
  preferences: NotificationPreferences = {
    deadlineAlerts: true,
    examAlerts: true,
    dailyPlanReminder: true,
  }
): Promise<{ deadlineAlertsSent: number; examAlertsSent: number }> {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return { deadlineAlertsSent: 0, examAlertsSent: 0 };
  }

  const sentMap = getSentNotificationsMap();
  const now = Date.now();
  let deadlineAlertsSent = 0;
  let examAlertsSent = 0;

  // 1. Evaluate Deadlines (24h and 3h alerts)
  if (preferences.deadlineAlerts !== false) {
    for (const d of deadlines) {
      if (d.completed) continue;
      if (!d.dueDate) continue;

      // Calculate deadline target timestamp in user's local timezone
      const timeStr = d.dueTime ? d.dueTime : "23:59:00";
      const targetDate = new Date(`${d.dueDate}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}`);
      const targetTimestamp = targetDate.getTime();

      if (isNaN(targetTimestamp)) continue;

      const diffMs = targetTimestamp - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 3-Hour Urgent Alert (between 0 and 3 hours remaining)
      if (diffHours > 0 && diffHours <= 3) {
        const key3h = `deadline_${d.id}_3h`;
        if (!sentMap[key3h]) {
          const minutesRemaining = Math.max(1, Math.round(diffHours * 60));
          const sent = await showLocalNotification(
            `🚨 Urgent: ${d.taskName || "Deadline"}`,
            {
              body: `${d.subject} is due in ${minutesRemaining} minutes! (${d.dueTime || "Today"})`,
              tag: `deadline-3h-${d.id}`,
            }
          );
          if (sent) {
            recordSentNotification(key3h);
            deadlineAlertsSent++;
          }
        }
      }
      // 24-Hour Alert (between 3 and 24 hours remaining)
      else if (diffHours > 3 && diffHours <= 24) {
        const key24h = `deadline_${d.id}_24h`;
        if (!sentMap[key24h]) {
          const hoursRemaining = Math.round(diffHours);
          const sent = await showLocalNotification(
            `⏳ Due Tomorrow: ${d.taskName || "Deadline"}`,
            {
              body: `${d.subject} is due in ~${hoursRemaining} hours${d.dueTime ? ` at ${d.dueTime}` : ""}.`,
              tag: `deadline-24h-${d.id}`,
            }
          );
          if (sent) {
            recordSentNotification(key24h);
            deadlineAlertsSent++;
          }
        }
      }
    }
  }

  // 2. Evaluate Exams (24h and 2h countdown alerts)
  if (preferences.examAlerts !== false) {
    for (const ex of exams) {
      if (!ex.examDate) continue;

      const timeStr = ex.startTime ? ex.startTime : "09:00:00";
      const targetDate = new Date(`${ex.examDate}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}`);
      const targetTimestamp = targetDate.getTime();

      if (isNaN(targetTimestamp)) continue;

      const diffMs = targetTimestamp - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 2-Hour Exam Alert
      if (diffHours > 0 && diffHours <= 2) {
        const key2h = `exam_${ex.id}_2h`;
        if (!sentMap[key2h]) {
          const sent = await showLocalNotification(
            `🚨 Exam Starting Soon: ${ex.subject}`,
            {
              body: `${ex.examType || "Scheduled"} Exam begins at ${ex.startTime}${ex.room ? ` in ${ex.room}` : ""}. Good luck!`,
              tag: `exam-2h-${ex.id}`,
            }
          );
          if (sent) {
            recordSentNotification(key2h);
            examAlertsSent++;
          }
        }
      }
      // 24-Hour Exam Alert
      else if (diffHours > 2 && diffHours <= 24) {
        const key24h = `exam_${ex.id}_24h`;
        if (!sentMap[key24h]) {
          const sent = await showLocalNotification(
            `📝 Exam Tomorrow: ${ex.subject}`,
            {
              body: `${ex.examType || "Scheduled"} Exam at ${ex.startTime}${ex.room ? ` in ${ex.room}` : ""}. Check your revision plan.`,
              tag: `exam-24h-${ex.id}`,
            }
          );
          if (sent) {
            recordSentNotification(key24h);
            examAlertsSent++;
          }
        }
      }
    }
  }

  return { deadlineAlertsSent, examAlertsSent };
}

/**
 * Initializes the foreground/active application reminder scheduler.
 * Runs evaluation immediately, periodically every 60 seconds, and when tab becomes visible.
 */
export function startNotificationScheduler(
  getDeadlines: () => Deadline[],
  getExams: () => Exam[],
  getPreferences: () => NotificationPreferences
): () => void {
  const check = () => {
    evaluateDeadlinesAndNotify(
      getDeadlines(),
      getExams(),
      getPreferences()
    ).catch((err) => {
      console.warn("Notification scheduler evaluation error:", err);
    });
  };

  // Initial check on mount
  check();

  // Periodic interval check every 60 seconds
  const intervalId = setInterval(check, 60 * 1000);

  // Check whenever user switches back to the application tab/PWA window
  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      check();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return () => {
    clearInterval(intervalId);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}
