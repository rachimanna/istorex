import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { api, ApiError, json } from "@/lib/http";
import { audit } from "@/lib/log";
import { storeImage } from "@/lib/media";
import { clientIp } from "@/lib/security";
import { parseMultipart } from "@/lib/upload";

type Ctx = { params: Promise<{ id: string }> };
const MAX_SCREENSHOTS = 10;

export const POST = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const existing = await db.screenshot.count({ where: { appId: id } });
  if (!(await db.app.findUnique({ where: { id }, select: { id: true } }))) throw new ApiError(404, "Приложение не найдено");
  const up = await parseMultipart(req, { maxFileBytes: env.limits.maxImageBytes, maxFiles: MAX_SCREENSHOTS, allowedFields: [] });
  try {
    if (!up.files.length) throw new ApiError(400, "Файлы не переданы");
    if (existing + up.files.length > MAX_SCREENSHOTS) throw new ApiError(400, `Максимум ${MAX_SCREENSHOTS} скриншотов`);
    const created = [];
    for (const [i, f] of up.files.entries()) {
      const img = await storeImage(f, "screens", id);
      created.push(await db.screenshot.create({ data: { appId: id, key: img.key, width: img.width, height: img.height, sortOrder: existing + i } }));
    }
    await audit(admin.id, "app.screenshots.add", "app", id, { count: created.length }, clientIp(req));
    invalidateCatalog();
    return json({ ok: true, count: created.length }, { status: 201 });
  } finally {
    await up.cleanup();
  }
});
