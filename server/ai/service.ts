import {
  AIProvider,
  AIProviderAdapter,
  AIResult,
  ExtractRequestPayload,
  ExtractedDeadline,
  ExtractedTimetableEntry,
  ExtractedExamEntry,
  PlanMyDayPayload,
  GeneratedScheduleBlock,
  AIError,
} from "./types";
import { GeminiProviderAdapter } from "./gemini-adapter";
import { OpenRouterProviderAdapter } from "./openrouter-adapter";

export class AIService {
  private adapters: Map<AIProvider, AIProviderAdapter> = new Map();
  private defaultOrder: AIProvider[] = ["gemini", "openrouter"];

  constructor() {
    this.registerAdapter(new GeminiProviderAdapter());
    this.registerAdapter(new OpenRouterProviderAdapter());
  }

  public registerAdapter(adapter: AIProviderAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  public getAdapter(provider: AIProvider): AIProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  public getAvailableProviders(): AIProvider[] {
    const available: AIProvider[] = [];
    this.adapters.forEach((adapter, name) => {
      if (adapter.isAvailable()) {
        available.push(name);
      }
    });
    return available;
  }

  /**
   * Sanitizes internal error into a clean, safe, human-readable user message.
   * Strips out keys, endpoints, stack traces, and internal metadata.
   */
  public sanitizeErrorMessage(error: any): string {
    if (error instanceof AIError) {
      switch (error.code) {
        case "MISSING_API_KEY":
          return "AI service is not configured. Please configure an API key in your environment.";
        case "AUTHENTICATION_FAILED":
          return "AI service authentication failed. Please verify your provider API key.";
        case "RATE_LIMIT":
          return "AI service is temporarily busy due to rate limits. Please wait a moment and try again.";
        case "TIMEOUT":
          return "AI request timed out. Please try again with a shorter document or simpler notice.";
        case "PROVIDER_UNAVAILABLE":
          return "AI service is temporarily unavailable. Please try again in a few moments.";
        case "MALFORMED_OUTPUT":
          return "The document analysis encountered an incomplete response. Please try again or paste the text directly.";
        case "UNSUPPORTED_INPUT":
          return "The uploaded file format is not supported for AI analysis.";
        default:
          break;
      }
    }

    const raw = String(error?.message || error || "");
    const lower = raw.toLowerCase();

    if (lower.includes("json") || lower.includes("syntaxerror") || lower.includes("unexpected end")) {
      return "The AI generated an incomplete response. Please try again or paste the schedule text directly.";
    }
    if (lower.includes("rate limit") || lower.includes("quota") || lower.includes("429")) {
      return "AI service is temporarily busy due to rate limits. Please wait a moment and try again.";
    }
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return "AI request timed out. Please try again in a moment.";
    }
    if (lower.includes("unauthenticated") || lower.includes("api key") || lower.includes("401")) {
      return "AI service authentication failed. Please check your configuration.";
    }
    if (lower.includes("safety") || lower.includes("blocked")) {
      return "Notice analysis was flagged by safety filters. Please review the notice content.";
    }

    return "AI service is temporarily unavailable. Please try again or enter details manually.";
  }

  /**
   * Executes a task with automatic graceful fallback across registered providers.
   */
  private async executeWithFallback<T>(
    operationName: string,
    operation: (adapter: AIProviderAdapter) => Promise<AIResult<T>>,
    preferredProvider?: AIProvider
  ): Promise<AIResult<T>> {
    const order: AIProvider[] = [];

    if (preferredProvider && this.adapters.has(preferredProvider)) {
      order.push(preferredProvider);
    }

    for (const p of this.defaultOrder) {
      if (!order.includes(p)) {
        order.push(p);
      }
    }

    const availableOrder = order.filter((p) => {
      const adapter = this.adapters.get(p);
      return adapter && adapter.isAvailable();
    });

    if (availableOrder.length === 0) {
      throw new AIError({
        message: "No AI provider is currently configured with valid credentials.",
        code: "MISSING_API_KEY",
        isRetryable: false,
      });
    }

    const errors: { provider: AIProvider; error: any }[] = [];

    for (const providerName of availableOrder) {
      const adapter = this.adapters.get(providerName)!;
      try {
        console.log(`[AIService] Attempting ${operationName} via provider: ${providerName}`);
        const result = await operation(adapter);
        console.log(`[AIService] ${operationName} succeeded using ${result.provider} (${result.model})`);
        return result;
      } catch (err: any) {
        console.log(`[AIService] Provider ${providerName} unavailable for ${operationName}, trying next provider:`, err?.message || err);
        errors.push({ provider: providerName, error: err });

        // If the error was a permanent client/auth error and no other providers exist, stop early
        if (err instanceof AIError && !err.isRetryable && availableOrder.length === 1) {
          throw err;
        }
      }
    }

    // All available providers failed
    const primaryError = errors[0]?.error;
    throw new AIError({
      message: `All AI providers failed for ${operationName}.`,
      code: primaryError instanceof AIError ? primaryError.code : "PROVIDER_UNAVAILABLE",
      cause: errors,
    });
  }

  public async extractDeadlines(
    payload: ExtractRequestPayload,
    preferredProvider?: AIProvider
  ): Promise<AIResult<ExtractedDeadline[]>> {
    // If payload contains a PDF, prefer Gemini first if available (native PDF support)
    let chosenPreferred = preferredProvider;
    if (!chosenPreferred && payload.file?.mimeType?.toLowerCase().includes("pdf")) {
      chosenPreferred = "gemini";
    }

    return this.executeWithFallback(
      "extractDeadlines",
      (adapter) => adapter.extractDeadlines(payload),
      chosenPreferred
    );
  }

  public async generatePlanMyDay(
    payload: PlanMyDayPayload,
    preferredProvider?: AIProvider
  ): Promise<AIResult<GeneratedScheduleBlock[]>> {
    return this.executeWithFallback(
      "generatePlanMyDay",
      (adapter) => adapter.generatePlanMyDay(payload),
      preferredProvider
    );
  }

  public async extractTimetable(
    payload: ExtractRequestPayload,
    preferredProvider?: AIProvider
  ): Promise<AIResult<ExtractedTimetableEntry[]>> {
    let chosenPreferred = preferredProvider;
    if (!chosenPreferred && payload.file?.mimeType?.toLowerCase().includes("pdf")) {
      chosenPreferred = "gemini";
    }

    return this.executeWithFallback(
      "extractTimetable",
      async (adapter) => {
        if (!adapter.extractTimetable) {
          throw new AIError({
            message: `Provider ${adapter.name} does not support timetable extraction.`,
            code: "UNSUPPORTED_INPUT",
            provider: adapter.name,
            isRetryable: true,
          });
        }
        return adapter.extractTimetable(payload);
      },
      chosenPreferred
    );
  }

  public async extractExams(
    payload: ExtractRequestPayload,
    preferredProvider?: AIProvider
  ): Promise<AIResult<ExtractedExamEntry[]>> {
    let chosenPreferred = preferredProvider;
    if (!chosenPreferred && payload.file?.mimeType?.toLowerCase().includes("pdf")) {
      chosenPreferred = "gemini";
    }

    return this.executeWithFallback(
      "extractExams",
      async (adapter) => {
        if (!adapter.extractExams) {
          throw new AIError({
            message: `Provider ${adapter.name} does not support exam extraction.`,
            code: "UNSUPPORTED_INPUT",
            provider: adapter.name,
            isRetryable: true,
          });
        }
        return adapter.extractExams(payload);
      },
      chosenPreferred
    );
  }
}

export const aiService = new AIService();
