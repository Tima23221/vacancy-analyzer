import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { analysisSchema, geminiResponseSchema, type Analysis } from "./analysis-schema";
import { SYSTEM_INSTRUCTION, buildUserPrompt } from "./prompt";

// Stable Flash model available on the free tier. Newer previews (e.g. gemini-3.8-flash)
// can be enabled via GEMINI_MODEL, but on the free tier they often answer 503 "high demand".
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const REQUEST_TIMEOUT_MS = 40_000;

export type AnalysisErrorCode = "rate_limited" | "config" | "upstream";

export class AnalysisError extends Error {
  constructor(
    public code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AnalysisError("config", "Сервер не настроен: не задан GEMINI_API_KEY.");
  }
  client ??= new GoogleGenAI({
    apiKey,
    // We handle retries ourselves: exactly one, and never on 429.
    httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 1 } },
  });
  return client;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

async function requestOnce(vacancy: string, resume: string): Promise<Analysis> {
  const model = getModel();
  const response = await getClient().models.generateContent({
    model,
    contents: buildUserPrompt(vacancy, resume),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      temperature: 0.4,
      // Gemini 3.x thinks by default; extraction doesn't need deep reasoning and
      // low thinking keeps answers fast. Older models don't accept thinkingLevel.
      ...(/gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from model");

  const parsed = analysisSchema.parse(JSON.parse(text));
  // Never show a score the model invented without a resume.
  if (!resume) parsed.match = null;
  return parsed;
}

/** Errors that will not get better on a second try. */
function isFinal(error: unknown): boolean {
  if (error instanceof AnalysisError) return true;
  if (error instanceof ApiError) {
    return error.status === 429 || [400, 401, 403, 404].includes(error.status);
  }
  return false;
}

function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return new AnalysisError("rate_limited", "Лимит запросов исчерпан, попробуйте через минуту.");
    }
    if (error.status === 401 || error.status === 403) {
      return new AnalysisError("config", "Сервер не может обратиться к Gemini: проверьте API-ключ.");
    }
    if (error.status === 404) {
      return new AnalysisError("config", "Модель Gemini не найдена: проверьте GEMINI_MODEL.");
    }
    if (error.status === 503) {
      return new AnalysisError(
        "upstream",
        "Модель Gemini сейчас перегружена. Попробуйте через минуту.",
      );
    }
  }
  return new AnalysisError(
    "upstream",
    "Не удалось получить разбор от модели. Попробуйте ещё раз через несколько секунд.",
  );
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return `ApiError ${error.status}`;
  if (error instanceof Error) return `${error.name}: ${error.message.slice(0, 200)}`;
  return "unknown error";
}

export async function analyzeVacancy(vacancy: string, resume: string): Promise<Analysis> {
  try {
    return await requestOnce(vacancy, resume);
  } catch (first) {
    if (isFinal(first)) throw toAnalysisError(first);
    console.warn(`[analyze] attempt 1 failed (${describe(first)}), retrying once`);
    try {
      return await requestOnce(vacancy, resume);
    } catch (second) {
      console.error(`[analyze] attempt 2 failed (${describe(second)})`);
      throw toAnalysisError(second);
    }
  }
}
