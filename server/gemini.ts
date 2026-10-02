/**
 * Backward compatibility facade for Gemini functions.
 * All operations now route through the unified AI provider layer in ./ai/
 */

import {
  aiService,
  ExtractedDeadline,
  ExtractRequestPayload,
  PlanMyDayPayload,
  PlanMyDayFixedCommitment,
  PlanMyDayActiveDeadline,
  GeneratedScheduleBlock,
  getGeminiApiKey,
  formatGeminiError,
} from "./ai";

export type GeminiExtractedDeadline = ExtractedDeadline;
export type {
  ExtractRequestPayload,
  PlanMyDayPayload,
  PlanMyDayFixedCommitment,
  PlanMyDayActiveDeadline,
  GeneratedScheduleBlock,
};
export { getGeminiApiKey, formatGeminiError };

export async function extractDeadlinesWithGemini(
  payload: ExtractRequestPayload
): Promise<ExtractedDeadline[]> {
  const result = await aiService.extractDeadlines(payload, "gemini");
  return result.data;
}

export async function generatePlanMyDayWithGemini(
  payload: PlanMyDayPayload
): Promise<GeneratedScheduleBlock[]> {
  const result = await aiService.generatePlanMyDay(payload, "gemini");
  return result.data;
}
