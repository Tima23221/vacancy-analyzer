import { ApiError } from "@google/genai";

/*
  One place that decides what a failed Gemini call means: whether to retry,
  whether the retry should go to the fallback model, and what the user sees.
  Every kind has its own message — "перегружена" is shown only for a real 503.
*/

export type FailureKind =
  | "overloaded" // 503 UNAVAILABLE / high demand
  | "timeout" // our abort, or 504 DEADLINE_EXCEEDED from Gemini
  | "quota" // 429
  | "bad_request" // 400, e.g. an unsupported parameter for this model
  | "auth" // 401 / 403
  | "model_not_found" // 404
  | "bad_output" // empty answer, invalid JSON or schema mismatch
  | "server" // other 5xx
  | "network"; // fetch failed, DNS, connection reset

export type AnalysisErrorCode = "rate_limited" | "config" | "upstream";

export class AnalysisError extends Error {
  code: AnalysisErrorCode;
  kind?: FailureKind;

  constructor(code: AnalysisErrorCode, message: string, kind?: FailureKind) {
    super(message);
    this.name = "AnalysisError";
    this.code = code;
    this.kind = kind;
  }
}

export function classify(error: unknown): FailureKind {
  if (error instanceof ApiError) {
    if (error.status === 503) return "overloaded";
    if (error.status === 504) return "timeout";
    if (error.status === 429) return "quota";
    if (error.status === 400) return "bad_request";
    if (error.status === 401 || error.status === 403) return "auth";
    if (error.status === 404) return "model_not_found";
    return "server";
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") return "timeout";
    if (error.name === "ZodError" || error.name === "SyntaxError" || error.name === "EmptyResponseError") {
      return "bad_output";
    }
  }
  return "network";
}

/**
 * Where the single retry goes, or null for no retry.
 * - 503, timeout: the primary model is the problem → fallback model.
 * - 429: the primary model's quota is spent (free tier: 20 requests/day per
 *   model for Flash). The fallback has its own quota → fallback model. Never
 *   the same model again: that would only hit the same exhausted quota.
 * - 5xx, network, malformed output: transient → same model again.
 * - 400, 401/403, 404: a second call would fail the same way → no retry.
 */
export function retryTarget(kind: FailureKind, primary: string, fallback: string): string | null {
  switch (kind) {
    case "overloaded":
    case "timeout":
      return fallback;
    case "quota":
      return fallback !== primary ? fallback : null;
    case "server":
    case "network":
    case "bad_output":
      return primary;
    default:
      return null;
  }
}

const MESSAGES: Record<FailureKind, { code: AnalysisErrorCode; text: string }> = {
  overloaded: {
    code: "upstream",
    text: "Модель Gemini сейчас перегружена. Попробуйте через минуту.",
  },
  timeout: {
    code: "upstream",
    text: "Модель не успела ответить вовремя. Попробуйте ещё раз — обычно со второго раза получается.",
  },
  quota: {
    code: "rate_limited",
    text: "Лимит запросов исчерпан, попробуйте через минуту.",
  },
  bad_request: {
    code: "config",
    text: "Gemini отклонил запрос (ошибка 400). Проверьте GEMINI_MODEL: модель может не поддерживать нужные параметры.",
  },
  auth: {
    code: "config",
    text: "Сервер не может обратиться к Gemini: проверьте API-ключ.",
  },
  model_not_found: {
    code: "config",
    text: "Модель Gemini не найдена: проверьте GEMINI_MODEL и GEMINI_FALLBACK_MODEL.",
  },
  bad_output: {
    code: "upstream",
    text: "Модель вернула ответ в неожиданном формате. Попробуйте ещё раз.",
  },
  server: {
    code: "upstream",
    text: "На стороне Gemini произошла ошибка. Попробуйте ещё раз через несколько секунд.",
  },
  network: {
    code: "upstream",
    text: "Сервер не смог связаться с Gemini. Попробуйте ещё раз через несколько секунд.",
  },
};

export function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;
  const kind = classify(error);
  const { code, text } = MESSAGES[kind];
  return new AnalysisError(code, text, kind);
}

/** Status + Gemini's own error text for server logs; never user input or the key. */
export function describe(error: unknown, ms: number): string {
  const redact = (text: string) => text.replace(/AIza[\w-]{20,}/g, "<key>").slice(0, 300);
  if (error instanceof ApiError) return `ApiError ${error.status} after ${ms} ms: ${redact(error.message)}`;
  if (error instanceof Error) return `${error.name} after ${ms} ms: ${redact(error.message)}`;
  return `unknown error after ${ms} ms`;
}
