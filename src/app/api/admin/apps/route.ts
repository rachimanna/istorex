import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit } from "@/lib/log";
import { clientIp } from "@/lib/security";
import { appSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  await requireAdmin();
  const apps = await db.app.findMany({
    orderBy: { updatedAt: "desc" },
    include: { category: { select: { name: true } }, releases: { where: { isCurrent: true }, take: 1 }, _count: { select: { reports: { where: { status: "OPEN" } } } } },
  });
  return json(apps.map((a) => ({ ...a, releases: a.releases.map((r) => ({ ...r, sizeBytes: Number(r.sizeBytes) })) })));
});

export const POST = api(async (req: Request) => {
  const admin = await requireAdmin();
  const data = appSchema.parse(await readJson(req));
  if (await db.app.findUnique({ where: { slug: data.slug }, select: { id: true } })) throw new ApiError(409, "Такой slug уже занят");
  if (!(await db.category.findUnique({ where: { id: data.categoryId }, select: { id: true } }))) throw new ApiError(400, "Категория не найдена");
  const app = await db.app.create({ data: { ...data, status: "DRAFT" } });
  await audit(admin.id, "app.create", "app", app.id, { slug: app.slug, name: app.name }, clientIp(req));
  invalidateCatalog();
  return json(app, { status: 201 });
});
