import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { env } from "./env";
import { ApiError } from "./http";
import { randomToken, sha256Hex } from "./security";

export const SESSION_COOKIE = env.isProd && env.appUrl.startsWith("https") ? "__Host-sx_session" : "sx_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

// Constant-time-ish login: compare against a dummy hash when the user does not exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);
export async function checkCredentials(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return ok && user ? user : null;
}

export async function createSession(userId: string, req: Request) {
  const token = randomToken(32);
  await db.session.create({
    data: {
      id: sha256Hex(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: req.headers.get("user-agent")?.slice(0, 300),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256Hex(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; email: string; displayName: string; role: "USER" | "ADMIN"; deviceUdid: string | null };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({
    where: { id: sha256Hex(token) },
    include: { user: { select: { id: true, email: true, displayName: true, role: true, deviceUdid: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ApiError(401, "Требуется вход");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ApiError(401, "Требуется вход");
  if (u.role !== "ADMIN") throw new ApiError(403, "Доступ только для администратора");
  return u;
}
