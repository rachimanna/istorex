import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isSameOrigin } from "./security";
import { logError } from "./log";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: CSRF origin check for mutations, uniform error responses, error logging. */
export function api<C>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && opts.csrf !== false && !isSameOrigin(req)) {
        throw new ApiError(403, "Запрос отклонён: неверный источник (CSRF)");
      }
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, details: e.details }, { status: e.status });
      if (e instanceof ZodError) {
        return json({ error: "Некорректные данные", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      await logError("api", e, { method: req.method, url: new URL(req.url).pathname });
      return json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 256 * 1024) throw new ApiError(413, "Слишком большой запрос");
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Ожидался JSON");
  }
}
