import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { geminiResponseSchema, rawAnalysisSchema, type Analysis } from "./analysis-schema";
import {
  AnalysisError,
  classify,
  describe,
  retryTarget,
  toAnalysisError,
} from "./gemini-errors";
import { reconcileAnalysis } from "./reconcile";
import { SYSTEM_INSTRUCTION, buildUserPrompt } from "./prompt";

export { AnalysisError } from "./gemini-errors";

// Primary: the newest Flash. On the free tier it is often at 503 "high demand"
// and has only 20 requests/day, so every 503, timeout or 429 falls through to
// the Lite model, which has its own capacity and quota.
// Switch via GEMINI_MODEL / GEMINI_FALLBACK_MODEL without a code change.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

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
  // We handle retries ourselves: at most one, see retryTarget().
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
  Gemini 3.x thinks by default. Flash gets LOW: enough for extraction, and every
  Gemini 3 Flash accepts it (3.7/3.8 reject MINIMAL with 400). Flash-Lite is a
  smaller model that misjudges grades and statuses with little thinking, so it
  gets HIGH (~12–22 s). Older models (2.x) don't accept thinkingLevel at all.
*/
function thinkingLevelFor(model: string): ThinkingLevel | undefined {
  if (!/gemini-3/.test(model)) return undefined;
  return /flash-lite/.test(model) ? ThinkingLevel.HIGH : ThinkingLevel.LOW;
}

function requestOnce(model: string, vacancy: string, resume: string, timeoutMs: number) {
  return generate(model, vacancy, resume, timeoutMs, thinkingLevelFor(model));
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
 * Attempt 1 on the primary model. On 503, timeout or 429, attempt 2 goes to the
 * fallback model (Flash-Lite); on other transient errors it repeats the primary.
 * 400, 401/403 and 404 are not retried. See retryTarget().
 */
export async function analyzeVacancy(vacancy: string, resume: string): Promise<Analysis> {
  const { primary, fallback } = getModels();
  const startedAt = Date.now();

  try {
    return await requestOnce(primary, vacancy, resume, ATTEMPT_TIMEOUT_MS);
  } catch (first) {
    const firstMs = Date.now() - startedAt;
    const remaining = TOTAL_BUDGET_MS - firstMs;
    const retryModel = retryTarget(classify(first), primary, fallback);

    if (!retryModel || remaining < MIN_SECOND_ATTEMPT_MS) {
      console.error(`[analyze] ${primary} failed, not retrying (${describe(first, firstMs)})`);
      throw toAnalysisError(first);
    }

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
