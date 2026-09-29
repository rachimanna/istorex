import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, ApiError, json } from "@/lib/http";

type Ctx = { params: Promise<{ appId: string }> };

export const POST = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const { appId } = await params;
  const app = await db.app.findFirst({ where: { id: appId, status: "PUBLISHED" }, select: { id: true } });
  if (!app) throw new ApiError(404, "Приложение не найдено");
  await db.favorite.upsert({ where: { userId_appId: { userId: me.id, appId } }, create: { userId: me.id, appId }, update: {} });
  return json({ ok: true, favorite: true });
});

export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const { appId } = await params;
  await db.favorite.deleteMany({ where: { userId: me.id, appId } });
  return json({ ok: true, favorite: false });
});
