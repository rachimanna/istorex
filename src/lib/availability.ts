import "server-only";
import type { SigningStatus } from "@prisma/client";
import { invalidateCatalog } from "./cache";
import { db } from "./db";
import { headObject } from "./storage";

const EXPIRING_MS = 14 * 86400_000;

function signingFromDates(current: SigningStatus, dates: (Date | null)[], now: Date): SigningStatus {
  if (!["VALID", "EXPIRING_SOON", "EXPIRED"].includes(current)) return current;
  const valid = dates.filter((d): d is Date => !!d);
  if (!valid.length) return current;
  const earliest = Math.min(...valid.map((d) => d.getTime()));
  if (earliest <= now.getTime()) return "EXPIRED";
  if (earliest - now.getTime() < EXPIRING_MS) return "EXPIRING_SOON";
  return "VALID";
}

async function checkUrl(url: string): Promise<string | null> {
  const ctrl = AbortSignal.timeout(10_000);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl });
    if (res.status === 405 || res.status === 403) res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10_000) });
    return res.status < 400 ? null : `HTTP ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Verifies every current release: hosted files exist in storage with the expected size,
 * external links respond, and signing status is re-derived from profile/certificate expiry dates.
 */
export async function runAvailabilityCheck() {
  const now = new Date();
  const releases = await db.release.findMany({ where: { isCurrent: true, state: "READY" } });
  const results: { id: string; ok: boolean; error: string | null; signing: SigningStatus }[] = [];
  for (const r of releases) {
    let error: string | null = null;
    if (r.ipaKey) {
      try {
        const h = await headObject("ipa", r.ipaKey);
        if (BigInt(h.ContentLength ?? -1) !== r.sizeBytes) error = `Размер файла в хранилище (${h.ContentLength}) не совпадает с ожидаемым (${r.sizeBytes})`;
      } catch (e) {
        error = `Файл не найден в хранилище: ${e instanceof Error ? e.name : String(e)}`;
      }
    } else if (r.externalUrl) {
      const err = await checkUrl(r.externalUrl);
      if (err) error = `Внешняя ссылка недоступна: ${err}`;
    }
    const signing = signingFromDates(r.signingStatus, [r.profileExpiresAt, r.certExpiresAt], now);
    await db.release.update({ where: { id: r.id }, data: { lastCheckAt: now, lastCheckOk: !error, lastCheckError: error, signingStatus: signing } });
    results.push({ id: r.id, ok: !error, error, signing });
  }
  invalidateCatalog();
  return { checked: results.length, failed: results.filter((r) => !r.ok).length, results };
}
