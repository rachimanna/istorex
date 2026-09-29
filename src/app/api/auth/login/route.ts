import { checkCredentials, createSession } from "@/lib/auth";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/security";
import { loginSchema } from "@/lib/validators";

export const POST = api(async (req: Request) => {
  const ip = clientIp(req);
  const data = loginSchema.parse(await readJson(req));
  const byIp = rateLimit(`login-ip:${ip}`, 20, 15 * 60_000);
  const byEmail = rateLimit(`login-email:${data.email}`, 8, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) throw new ApiError(429, `Слишком много попыток входа. Повторите через ${Math.max(byIp.retryAfter, byEmail.retryAfter)} с`);
  const user = await checkCredentials(data.email, data.password);
  if (!user) throw new ApiError(401, "Неверный email или пароль");
  await createSession(user.id, req);
  if (user.role === "ADMIN") await audit(user.id, "admin.login", "user", user.id, {}, ip);
  return json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
});
