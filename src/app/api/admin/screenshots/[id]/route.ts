import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json } from "@/lib/http";
import { audit, logError } from "@/lib/log";
import { clientIp } from "@/lib/security";
import { deleteObject } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const s = await db.screenshot.findUnique({ where: { id } });
  if (!s) throw new ApiError(404, "Скриншот не найден");
  await db.screenshot.delete({ where: { id } });
  await deleteObject("media", s.key).catch((e) => logError("storage.delete", e, { key: s.key }));
  await audit(admin.id, "app.screenshots.delete", "app", s.appId, { key: s.key }, clientIp(req));
  invalidateCatalog();
  return json({ ok: true });
});
