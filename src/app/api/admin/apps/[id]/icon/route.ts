import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { api, ApiError, json } from "@/lib/http";
import { audit, logError } from "@/lib/log";
import { storeImage } from "@/lib/media";
import { clientIp } from "@/lib/security";
import { deleteObject, mediaUrl } from "@/lib/storage";
import { parseMultipart } from "@/lib/upload";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const app = await db.app.findUnique({ where: { id }, select: { id: true, iconKey: true } });
  if (!app) throw new ApiError(404, "Приложение не найдено");
  const up = await parseMultipart(req, { maxFileBytes: env.limits.maxImageBytes, maxFiles: 1, allowedFields: [] });
  try {
    const file = up.files[0];
    if (!file) throw new ApiError(400, "Файл не передан");
    const img = await storeImage(file, "icons", app.id);
    await db.app.update({ where: { id }, data: { iconKey: img.key } });
    if (app.iconKey && app.iconKey !== img.key) await deleteObject("media", app.iconKey).catch((e) => logError("storage.delete", e));
    await audit(admin.id, "app.icon", "app", id, { key: img.key }, clientIp(req));
    invalidateCatalog();
    return json({ ok: true, iconUrl: mediaUrl(img.key) });
  } finally {
    await up.cleanup();
  }
});
