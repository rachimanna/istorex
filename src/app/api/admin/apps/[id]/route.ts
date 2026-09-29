import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit, logError } from "@/lib/log";
import { clientIp } from "@/lib/security";
import { deleteObject } from "@/lib/storage";
import { appPatchSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const data = appPatchSchema.parse(await readJson(req));
  const app = await db.app.findUnique({ where: { id }, include: { releases: { where: { isCurrent: true, state: "READY" } } } });
  if (!app) throw new ApiError(404, "Приложение не найдено");

  if (data.slug && data.slug !== app.slug && (await db.app.findUnique({ where: { slug: data.slug }, select: { id: true } }))) {
    throw new ApiError(409, "Такой slug уже занят");
  }
  const merged = { ...app, ...data };
  if (data.status === "PUBLISHED") {
    const problems: string[] = [];
    if (!merged.iconKey) problems.push("загрузите иконку");
    if (app.releases.length === 0) problems.push("добавьте проверенную версию (релиз) и сделайте её текущей");
    if (merged.isModified && merged.legalBasis.trim().length < 20) problems.push("укажите правовое основание для модифицированной сборки");
    if (problems.length) throw new ApiError(400, `Нельзя опубликовать: ${problems.join("; ")}`);
  }
  const updated = await db.app.update({
    where: { id },
    data: { ...data, publishedAt: data.status === "PUBLISHED" && !app.publishedAt ? new Date() : undefined },
  });
  await audit(admin.id, data.status && data.status !== app.status ? `app.status.${data.status.toLowerCase()}` : "app.update", "app", id, { changed: Object.keys(data) }, clientIp(req));
  invalidateCatalog();
  return json(updated);
});

export const DELETE = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const app = await db.app.findUnique({ where: { id }, include: { screenshots: true, releases: true } });
  if (!app) throw new ApiError(404, "Приложение не найдено");
  const media = [app.iconKey, ...app.screenshots.map((s) => s.key)].filter((k): k is string => !!k);
  const ipas = app.releases.map((r) => r.ipaKey).filter((k): k is string => !!k);
  await db.app.delete({ where: { id } });
  // Storage cleanup after the DB delete; failures are logged for manual cleanup.
  for (const k of media) await deleteObject("media", k).catch((e) => logError("storage.delete", e, { key: k }));
  for (const k of ipas) await deleteObject("ipa", k).catch((e) => logError("storage.delete", e, { key: k }));
  await audit(admin.id, "app.delete", "app", id, { slug: app.slug, name: app.name, files: media.length + ipas.length }, clientIp(req));
  invalidateCatalog();
  return json({ ok: true });
});
