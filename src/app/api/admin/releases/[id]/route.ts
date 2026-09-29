import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit, logError } from "@/lib/log";
import { makeCurrent } from "@/lib/releases";
import { clientIp } from "@/lib/security";
import { deleteObject } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  makeCurrent: z.literal(true).optional(),
  changelog: z.string().trim().max(4000).optional(),
  minIOS: z.string().trim().regex(/^\d+(\.\d+){0,2}$/).optional(),
  enterpriseAttested: z.boolean().optional(),
});

export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const data = patchSchema.parse(await readJson(req));
  const r = await db.release.findUnique({ where: { id } });
  if (!r) throw new ApiError(404, "Сборка не найдена");
  if (data.makeCurrent) {
    if (r.state !== "READY") throw new ApiError(400, "Текущей можно сделать только сборку, прошедшую проверку");
    await makeCurrent(id, r.appId);
  }
  await db.release.update({ where: { id }, data: { changelog: data.changelog, minIOS: data.minIOS, enterpriseAttested: data.enterpriseAttested } });
  await audit(admin.id, data.makeCurrent ? "release.make_current" : "release.update", "release", id, { appId: r.appId, changed: Object.keys(data) }, clientIp(req));
  invalidateCatalog();
  return json({ ok: true });
});

export const DELETE = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const r = await db.release.findUnique({ where: { id } });
  if (!r) throw new ApiError(404, "Сборка не найдена");
  await db.release.delete({ where: { id } });
  if (r.isCurrent) {
    // Fall back to the newest remaining valid release; hide the app if none is left.
    const next = await db.release.findFirst({ where: { appId: r.appId, state: "READY" }, orderBy: { createdAt: "desc" } });
    if (next) await makeCurrent(next.id, r.appId);
    else await db.app.updateMany({ where: { id: r.appId, status: "PUBLISHED" }, data: { status: "HIDDEN" } });
  }
  // The same file can back only one READY release per app (duplicate check), so it is safe to delete.
  if (r.ipaKey && !(await db.release.findFirst({ where: { ipaKey: r.ipaKey } }))) {
    await deleteObject("ipa", r.ipaKey).catch((e) => logError("storage.delete", e, { key: r.ipaKey }));
  }
  await audit(admin.id, "release.delete", "release", id, { appId: r.appId, version: r.version }, clientIp(req));
  invalidateCatalog();
  return json({ ok: true });
});
