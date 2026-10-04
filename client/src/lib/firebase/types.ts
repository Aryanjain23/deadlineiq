import type { ImportanceLevel, DeadlineSource } from "@/lib/deadlines";
import type { DayOfWeek } from "@/lib/timetable";

/**
 * Normalized User Profile Document
 * Firestore Path: users/{uid}
 */
export interface UserProfileDocument {
  uid: string;
  displayName: string;
  email: string | null;
  phoneNumber?: string | null;
  usn: string;
  branch?: string;
  degree?: string;
  semester?: string;
  college?: string;
  photoURL?: string | null;
  preferences?: {
    theme?: "dark" | "light" | "system";
    emailNotifications?: boolean;
    dailyPlanReminder?: boolean;
    deadlineAlerts?: boolean;
    examAlerts?: boolean;
    compactView?: boolean;
  };
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/**
 * Normalized Deadline Document
 * Firestore Path: users/{uid}/deadlines/{deadlineId}
 */
export interface FirestoreDeadlineDocument {
  id: string;
  taskName: string;
  subject: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm (24hr format)
  importance: ImportanceLevel; // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  completed: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  source: DeadlineSource; // "manual" | "ai"
  sourceType?: "manual" | "ai" | "imported";
  sourceId?: string;
  dateSource?: "ai-extracted" | "timetable-inferred" | "user-entered";
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  timetableDerived?: boolean;
}

/**
 * Normalized Timetable Document
 * Firestore Path: users/{uid}/timetable/{timetableId}
 */
export interface FirestoreTimetableDocument {
  id: string;
  day: DayOfWeek;
  subject: string;
  subjectCode?: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  room?: string;
  instructor?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EventCategory = "Academic" | "Sports" | "Personal" | "Other";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  category: EventCategory;
  location?: string;
  notes?: string;
  allDay?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  isGoogleSynced?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FirestoreEventDocument {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  category: EventCategory;
  location?: string;
  notes?: string;
  allDay?: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  isGoogleSynced?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Conceptual Source Document (Notice, PDF, Screenshot, WhatsApp Text)
 * Firestore Path: users/{uid}/sources/{sourceId}
 */
export interface FirestoreSourceDocument {
  id: string;
  name: string;
  fileType: "image/jpeg" | "image/png" | "application/pdf" | "text/plain";
  storagePath?: string;
  sizeBytes?: number;
  extractedDeadlinesCount: number;
  uploadedAt: string;
}

/**
 * User Settings Document
 * Firestore Path: users/{uid}/settings/{settingId}
 */
export interface FirestoreUserSettingsDocument {
  theme: "dark" | "system";
  notificationReminders: boolean;
  radarWindowDays: number;
  pomodoroFocusMinutes: number;
  updatedAt: string;
}

/**
 * Future FCM Token Document
 * Firestore Path: users/{uid}/notificationTokens/{tokenId}
 */
export interface FirestoreNotificationTokenDocument {
  token: string;
  devicePlatform: "web" | "android" | "ios";
  createdAt: string;
  lastUsedAt: string;
}

export type ScheduleBlockType =
  | "class"
  | "task"
  | "event"
  | "break"
  | "revision"
  | "skill"
  | "review"
  | "organize";

export interface ScheduleBlock {
  id: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  activity: string;
  title?: string;
  description?: string;
  type: ScheduleBlockType;
  priority?: ImportanceLevel;
  deadlineId?: string;
  subject?: string;
  reason?: string;
  location?: string;
  isCompleted?: boolean;
  completed?: boolean;
  isAiRecommendation?: boolean;
  isAccepted?: boolean;
}

export interface PlanPreferences {
  startTime: string;
  endTime: string;
  sessionLengthMinutes: number;
  breakLengthMinutes: number;
}

export interface SavedDailyPlan {
  id: string; // Date string YYYY-MM-DD or unique plan ID
  planId?: string;
  userId?: string;
  date: string; // YYYY-MM-DD
  timezone?: string;
  planningStart?: string;
  planningEnd?: string;
  blocks: ScheduleBlock[];
  preferences?: PlanPreferences;
  createdAt: string;
  updatedAt: string;
}
