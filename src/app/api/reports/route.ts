import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { clientIp, hashIp, rateLimit } from "@/lib/security";
import { reportSchema } from "@/lib/validators";

/** Public complaint / takedown request (copyright, malware, broken build...). */
export const POST = api(async (req: Request) => {
  const ip = clientIp(req);
  const rl = rateLimit(`report:${ip}`, 5, 3600_000);
  if (!rl.ok) throw new ApiError(429, "Слишком много жалоб с этого адреса. Попробуйте позже.");
  const data = reportSchema.parse(await readJson(req));
  const app = await db.app.findUnique({ where: { id: data.appId }, select: { id: true } });
  if (!app) throw new ApiError(404, "Приложение не найдено");
  const user = await getCurrentUser();
  const report = await db.report.create({
    data: { appId: app.id, userId: user?.id, email: data.email ?? user?.email, reason: data.reason, message: data.message, ipHash: hashIp(ip) },
  });
  return json({ ok: true, id: report.id }, { status: 201 });
});
