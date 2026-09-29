import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { api, ApiError, json, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security";
import { registerSchema } from "@/lib/validators";

export const POST = api(async (req: Request) => {
  if (!env.allowRegistration) throw new ApiError(403, "Регистрация временно закрыта");
  const rl = rateLimit(`register:${clientIp(req)}`, 5, 3600_000);
  if (!rl.ok) throw new ApiError(429, `Слишком много попыток. Повторите через ${rl.retryAfter} с`);
  const data = registerSchema.parse(await readJson(req));
  const exists = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) throw new ApiError(409, "Пользователь с таким email уже существует");
  const user = await db.user.create({
    data: { email: data.email, displayName: data.displayName, passwordHash: await hashPassword(data.password) },
  });
  await createSession(user.id, req);
  return json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } }, { status: 201 });
});
