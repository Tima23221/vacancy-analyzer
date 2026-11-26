import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
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

// Flash-Lite models, chosen 26.11.2026 for the free-tier key: Flash models
// (3.5–3.8) kept answering 503 "high demand", Lite ones answered more often.
// Lite gets HIGH thinking (see thinkingLevelFor) to make up for the smaller model.
// Switch via GEMINI_MODEL / GEMINI_FALLBACK_MODEL without a code change.
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
// Older Lite with separate capacity: the retry goes here on 503 or timeout.
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite";

// Per-attempt timeout: a minute, so Lite models with HIGH thinking (~20 s) and
// Flash models with LOW thinking (20–35 s) can finish. Both attempts must also fit
// into TOTAL_BUDGET_MS, which stays under the route's maxDuration (150 s) with
// room for validation and cold start.
const ATTEMPT_TIMEOUT_MS = 60_000;
const TOTAL_BUDGET_MS = 125_000;
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

/*
  Gemini 3.x thinks by default. Extraction doesn't need deep reasoning, so we ask
  for the least thinking the model allows: MINIMAL where supported (≈5 s), LOW
  otherwise. Some models reject MINIMAL with 400 "Thinking level MINIMAL is not
  supported" (seen on gemini-3.7-flash and gemini-3.8-flash); such models are
  remembered here, and unknown ones are learned on the first 400.
  Older models (2.x) don't accept thinkingLevel at all.
*/
const noMinimalThinking = new Set(["gemini-3.7-flash", "gemini-3.8-flash"]);

function thinkingLevelFor(model: string): ThinkingLevel | undefined {
  if (!/gemini-3/.test(model)) return undefined;
  // Flash-Lite is fast but shallow: with minimal thinking it misjudges grades and
  // statuses, so it gets HIGH to make up for the smaller model.
  if (/flash-lite/.test(model)) return ThinkingLevel.HIGH;
  return noMinimalThinking.has(model) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
}

function isUnsupportedThinkingLevel(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && /thinking level/i.test(error.message);
}

async function requestOnce(
  model: string,
  vacancy: string,
  resume: string,
  timeoutMs: number,
): Promise<Analysis> {
  const startedAt = Date.now();
  try {
    return await generate(model, vacancy, resume, timeoutMs, thinkingLevelFor(model));
  } catch (error) {
    // Not a real failure: the model just wants more thinking. Learn it and redo
    // the call right away with LOW, within the same attempt's time.
    if (!isUnsupportedThinkingLevel(error) || thinkingLevelFor(model) !== ThinkingLevel.MINIMAL) throw error;
    noMinimalThinking.add(model);
    console.warn(`[analyze] ${model} rejects thinkingLevel MINIMAL, using LOW`);
    return generate(model, vacancy, resume, timeoutMs - (Date.now() - startedAt), ThinkingLevel.LOW);
  }
}

async function generate(
  model: string,
  vacancy: string,
  resume: string,
  timeoutMs: number,
  thinkingLevel: ThinkingLevel | undefined,
): Promise<Analysis> {
  const response = await getClient().models.generateContent({
    model,
    contents: buildUserPrompt(vacancy, resume),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      temperature: 0.4,
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
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
