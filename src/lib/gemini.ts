import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { geminiResponseSchema, rawAnalysisSchema, type Analysis } from "./analysis-schema";
import {
  AnalysisError,
  classify,
  describe,
  isRetryable,
  shouldUseFallback,
  toAnalysisError,
} from "./gemini-errors";
import { reconcileAnalysis } from "./reconcile";
import { SYSTEM_INSTRUCTION, buildUserPrompt } from "./prompt";

export { AnalysisError } from "./gemini-errors";

// Stable Flash model on the free tier. It does hit 503 "high demand" at peak
// times, which is why a fallback model exists below.
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
// Lighter model with separate capacity: the retry goes here on 503 or timeout.
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

// Per-attempt timeout. Both attempts must also fit into TOTAL_BUDGET_MS, which
// stays under the route's maxDuration (60 s) with room for validation.
const ATTEMPT_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 52_000;
const MIN_SECOND_ATTEMPT_MS = 8_000;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AnalysisError("config", "Сервер не настроен: не задан GEMINI_API_KEY.");
  }
  // We handle retries ourselves: exactly one, and never on 429.
  client ??= new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return client;
}

function getModels() {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_GEMINI_FALLBACK_MODEL;
  return { primary, fallback };
}

class EmptyResponseError extends Error {
  name = "EmptyResponseError";
}

async function requestOnce(
  model: string,
  vacancy: string,
  resume: string,
  timeoutMs: number,
): Promise<Analysis> {
  const response = await getClient().models.generateContent({
    model,
    contents: buildUserPrompt(vacancy, resume),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      temperature: 0.4,
      // Gemini 3.x thinks by default. Extraction doesn't need deep reasoning, and
      // minimal thinking keeps answers well inside the attempt timeout.
      // Older models don't accept thinkingLevel.
      ...(/gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
      httpOptions: { timeout: timeoutMs },
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });

  const text = response.text;
  if (!text) throw new EmptyResponseError("Empty response from model");

  const parsed = rawAnalysisSchema.parse(JSON.parse(text));
  // Drops a score invented without a resume and makes requirement statuses
  // agree with the "Не хватает" list.
  return reconcileAnalysis(parsed, Boolean(resume));
}

/**
 * Attempt 1 on the primary model. On 503 or timeout, attempt 2 goes to the
 * fallback model (Flash-Lite); on other transient errors it repeats the primary.
 * 429, 400, 401/403 and 404 are not retried.
 */
export async function analyzeVacancy(vacancy: string, resume: string): Promise<Analysis> {
  const { primary, fallback } = getModels();
  const startedAt = Date.now();

  try {
    return await requestOnce(primary, vacancy, resume, ATTEMPT_TIMEOUT_MS);
  } catch (first) {
    const firstMs = Date.now() - startedAt;
    const kind = classify(first);
    const remaining = TOTAL_BUDGET_MS - firstMs;

    if (!isRetryable(kind) || remaining < MIN_SECOND_ATTEMPT_MS) {
      console.error(`[analyze] ${primary} failed, not retrying (${describe(first, firstMs)})`);
      throw toAnalysisError(first);
    }

    const retryModel = shouldUseFallback(kind) ? fallback : primary;
    console.warn(`[analyze] ${primary} failed, retrying on ${retryModel} (${describe(first, firstMs)})`);

    const secondStartedAt = Date.now();
    try {
      const result = await requestOnce(
        retryModel,
        vacancy,
        resume,
        Math.min(ATTEMPT_TIMEOUT_MS, remaining),
      );
      console.info(`[analyze] ${retryModel} succeeded in ${Date.now() - secondStartedAt} ms`);
      return result;
    } catch (second) {
      console.error(`[analyze] ${retryModel} failed too (${describe(second, Date.now() - secondStartedAt)})`);
      throw toAnalysisError(second);
    }
  }
}
