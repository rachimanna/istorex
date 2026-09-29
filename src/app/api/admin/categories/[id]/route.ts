import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit } from "@/lib/log";
import { clientIp } from "@/lib/security";
import { categorySchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const data = categorySchema.partial().parse(await readJson(req));
  const cat = await db.category.update({ where: { id }, data }).catch(() => {
    throw new ApiError(409, "Не удалось обновить категорию (slug занят или категория не найдена)");
  });
  await audit(admin.id, "category.update", "category", id, { changed: Object.keys(data) }, clientIp(req));
  invalidateCatalog();
  return json(cat);
});

export const DELETE = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const used = await db.app.count({ where: { categoryId: id } });
  if (used) throw new ApiError(409, `В категории ${used} приложений — сначала перенесите их`);
  await db.category.delete({ where: { id } });
  await audit(admin.id, "category.delete", "category", id, {}, clientIp(req));
  invalidateCatalog();
  return json({ ok: true });
});
