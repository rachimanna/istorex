import "server-only";
import type { DownloadKind, Release } from "@prisma/client";
import { getCurrentUser } from "./auth";
import { hostedDeliveryBlockers } from "./catalog";
import { db } from "./db";
import { env } from "./env";
import { ApiError } from "./http";
import { clientIp, hashIp } from "./security";

/**
 * Enforces per-IP daily quota and the monthly egress budget, then records a real delivery event.
 * Download counters count unique (IP, release) per 24h so reloads don't inflate statistics.
 */
export async function recordDelivery(req: Request, release: Release, kind: DownloadKind) {
  const ipHash = hashIp(clientIp(req));
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const hosted = kind !== "EXTERNAL_LINK";

  if (hosted) {
    const blockers = await hostedDeliveryBlockers();
    if (blockers.length) throw new ApiError(503, blockers[0]!);
    const recent = await db.downloadEvent.count({ where: { ipHash, createdAt: { gte: since }, kind: { not: "EXTERNAL_LINK" } } });
    if (recent >= env.limits.downloadsPerIpPerDay) {
      throw new ApiError(429, "Достигнут дневной лимит загрузок с этого адреса. Попробуйте завтра.");
    }
  }

  const user = await getCurrentUser().catch(() => null);
  const seen = await db.downloadEvent.findFirst({ where: { ipHash, releaseId: release.id, createdAt: { gte: since } }, select: { id: true } });
  await db.$transaction([
    db.downloadEvent.create({
      data: {
        appId: release.appId,
        releaseId: release.id,
        userId: user?.id,
        kind,
        bytes: hosted ? release.sizeBytes : BigInt(0),
        ipHash,
        userAgent: req.headers.get("user-agent")?.slice(0, 300),
      },
    }),
    ...(seen ? [] : [db.app.update({ where: { id: release.appId }, data: { downloadCount: { increment: 1 } } })]),
  ]);
}

/** Loads a release that may be delivered publicly: app published, release ready. */
export async function deliverableRelease(id: string) {
  const r = await db.release.findUnique({ where: { id }, include: { app: { select: { status: true, name: true, slug: true, iconKey: true } } } });
  if (!r || r.app.status !== "PUBLISHED") throw new ApiError(404, "Сборка не найдена");
  if (r.state !== "READY") throw new ApiError(409, "Сборка не прошла проверку или ещё обрабатывается");
  return r;
}
