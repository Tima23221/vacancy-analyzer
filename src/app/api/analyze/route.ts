import { NextResponse } from "next/server";
import { analyzeRequestSchema } from "@/lib/analysis-schema";
import { AnalysisError, analyzeVacancy } from "@/lib/gemini";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Worst case: both Gemini attempts share a 125 s budget (60 s per attempt, see
// lib/gemini.ts), leaving ~25 s for validation and cold start. Needs Fluid Compute
// on Vercel (default for new projects, up to 300 s on every plan); without it the
// Hobby ceiling is 60 s.
export const maxDuration = 150;

function errorResponse(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(request: Request) {
  const limit = checkRateLimit(getClientIp(request.headers));
  if (!limit.ok) {
    return errorResponse(
      429,
      `Слишком много запросов: не больше 10 в минуту. Повторите через ${limit.retryAfterSec} с.`,
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Некорректный запрос.");
  }

  const input = analyzeRequestSchema.safeParse(body);
  if (!input.success) {
    return errorResponse(400, input.error.issues[0]?.message ?? "Проверьте введённые данные.");
  }

  try {
    const analysis = await analyzeVacancy(input.data.vacancy, input.data.resume);
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof AnalysisError) {
      const status =
        error.kind === "overloaded"
          ? 503
          : error.kind === "timeout"
            ? 504
            : error.code === "rate_limited"
              ? 429
              : error.code === "config"
                ? 500
                : 502;
      return errorResponse(status, error.message);
    }
    console.error("[analyze] unexpected error");
    return errorResponse(500, "Внутренняя ошибка сервера. Попробуйте ещё раз.");
  }
}
