import "server-only";
import { db } from "./db";

/** Makes a release the current one for its app (publishing an update). */
export async function makeCurrent(releaseId: string, appId: string) {
  await db.$transaction([
    db.release.updateMany({ where: { appId, isCurrent: true }, data: { isCurrent: false } }),
    db.release.update({ where: { id: releaseId }, data: { isCurrent: true } }),
    db.app.update({ where: { id: appId }, data: { updatedAt: new Date() } }),
  ]);
}

export function serializeRelease<T extends { sizeBytes: bigint }>(r: T) {
  return { ...r, sizeBytes: Number(r.sizeBytes) };
}
