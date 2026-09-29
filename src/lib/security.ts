import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Client IP. The app is meant to run behind Caddy, which overwrites X-Forwarded-For with the real client IP. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

/** IPs are never stored in clear text: salted hash only. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${env.sessionSecret}:${ip}`).digest("hex").slice(0, 32);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * CSRF protection for state-changing requests: the request must come from our own origin.
 * Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE, so a mismatch = forged request.
 * Session cookies are additionally SameSite=Lax.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const allowed = new Set<string>([new URL(env.appUrl).origin]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? (env.appUrl.startsWith("https") ? "https" : "http");
    allowed.add(`${proto}://${host}`);
  }
  if (origin) return allowed.has(origin);
  return req.headers.get("sec-fetch-site") === "same-origin";
}

// ─── Simple in-memory sliding-window rate limiter (single-instance deployment) ───
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0]!)) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}
