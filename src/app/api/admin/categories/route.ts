import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit } from "@/lib/log";
import { clientIp } from "@/lib/security";
import { categorySchema } from "@/lib/validators";

export const POST = api(async (req: Request) => {
  const admin = await requireAdmin();
  const data = categorySchema.parse(await readJson(req));
  if (await db.category.findUnique({ where: { slug: data.slug } })) throw new ApiError(409, "Категория с таким slug уже есть");
  const cat = await db.category.create({ data });
  await audit(admin.id, "category.create", "category", cat.id, { slug: cat.slug }, clientIp(req));
  invalidateCatalog();
  return json(cat, { status: 201 });
});
