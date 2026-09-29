import type { Readable } from "node:stream";
import { Readable as NodeReadable } from "node:stream";
import { api, ApiError } from "@/lib/http";
import { getObject } from "@/lib/storage";

type Ctx = { params: Promise<{ key: string[] }> };
const KEY_RE = /^(icons|screens)\/[a-z0-9]+\/[a-f0-9]{16,64}\.(png|jpg|webp)$/;

/** Proxies icons/screenshots from the media bucket when no public CDN URL is configured. */
export const GET = api(async (_req: Request, { params }: Ctx) => {
  const key = (await params).key.join("/");
  if (!KEY_RE.test(key)) throw new ApiError(404, "Не найдено");
  let obj;
  try {
    obj = await getObject("media", key);
  } catch {
    throw new ApiError(404, "Не найдено");
  }
  const body = NodeReadable.toWeb(obj.Body as Readable) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": obj.ContentType ?? "application/octet-stream",
      "Content-Length": String(obj.ContentLength ?? ""),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
