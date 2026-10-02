export type AIProvider = "gemini" | "openrouter";

export type AIErrorCode =
  | "MISSING_API_KEY"
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MALFORMED_OUTPUT"
  | "UNSUPPORTED_INPUT"
  | "UNKNOWN";

export class AIError extends Error {
  public readonly code: AIErrorCode;
  public readonly provider?: AIProvider;
  public readonly status?: number;
  public readonly isRetryable: boolean;

  constructor(options: {
    message: string;
    code: AIErrorCode;
    provider?: AIProvider;
    status?: number;
    isRetryable?: boolean;
    cause?: any;
  }) {
    super(options.message);
    this.name = "AIError";
    this.code = options.code;
    this.provider = options.provider;
    this.status = options.status;
    this.isRetryable =
      options.isRetryable ??
      (options.code === "RATE_LIMIT" ||
        options.code === "TIMEOUT" ||
        options.code === "PROVIDER_UNAVAILABLE");
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export interface ExtractedDeadline {
  taskName: string;
  subject: string;
  hasExplicitDate: boolean;
  explicitDueDate: string | null;
  explicitDueDayOfWeek: string | null;
  isRelativeClassMention: boolean;
  dueTime: string | null;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  geminiReasoning: string; // Preserved for compatibility with existing UI
  sourceType?: "SYLLABUS" | "CANVAS" | "EMAIL" | "ASSIGNMENT" | "CLASS_NOTICE" | "OTHER";
  isDateAmbiguous?: boolean;
  ambiguityNote?: string | null;
  notes?: string | null;
}

export interface ExtractRequestPayload {
  text?: string;
  file?: {
    base64: string;
    mimeType: string;
    name?: string;
  };
  currentDate?: string; // YYYY-MM-DD
}

export interface PlanMyDayFixedCommitment {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: "class" | "event";
  location?: string;
  subject?: string;
}

export interface PlanMyDayActiveDeadline {
  id: string;
  taskName: string;
  subject: string;
  dueDate: string;
  dueTime?: string;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description?: string;
  isOverdue: boolean;
  isDueToday: boolean;
  isDueSoon: boolean;
}

export interface PlanMyDayPayload {
  currentDate: string; // YYYY-MM-DD
  currentTime: string; // HH:mm
  preferences: {
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    sessionLengthMinutes: number;
    breakLengthMinutes: number;
  };
  fixedCommitments: PlanMyDayFixedCommitment[];
  activeDeadlines: PlanMyDayActiveDeadline[];
}

export interface GeneratedScheduleBlock {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  type: "class" | "task" | "event" | "break";
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  deadlineId?: string;
  subject?: string;
  reason?: string;
  location?: string;
}

export interface AIResult<T> {
  data: T;
  provider: AIProvider;
  model: string;
}

export interface AIProviderAdapter {
  readonly name: AIProvider;
  isAvailable(): boolean;
  extractDeadlines(payload: ExtractRequestPayload): Promise<AIResult<ExtractedDeadline[]>>;
  generatePlanMyDay(payload: PlanMyDayPayload): Promise<AIResult<GeneratedScheduleBlock[]>>;
}
