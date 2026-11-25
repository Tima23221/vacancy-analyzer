import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "./limits";

/**
 * Sliding-window limiter kept in process memory.
 * Good enough for a portfolio app: on Vercel each warm function instance has
 * its own window, so the effective limit is "per IP per instance".
 */
const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, now = Date.now()) {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    hits.set(key, recent);
    const retryAfterMs = recent[0] + RATE_LIMIT_WINDOW_MS - now;
    return { ok: false as const, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing forever.
  if (hits.size > 5000) {
    for (const [k, list] of hits) {
      if (list.every((t) => t <= windowStart)) hits.delete(k);
    }
  }

  return { ok: true as const };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
