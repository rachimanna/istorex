import "server-only";
import { readFile } from "node:fs/promises";
import { env } from "./env";
import { ApiError } from "./http";
import { sniffImage } from "./images";
import { putObject } from "./storage";
import type { UploadedFile } from "./upload";

/** Validates an uploaded image by content (not by extension/MIME) and stores it in the media bucket. */
export async function storeImage(file: UploadedFile, kind: "icons" | "screens", appId: string) {
  if (file.size > env.limits.maxImageBytes) throw new ApiError(413, "Изображение слишком большое");
  const buf = await readFile(file.path);
  const info = sniffImage(buf);
  if (!info) throw new ApiError(415, `${file.filename}: допустимы только PNG, JPEG или WebP`);
  if (info.width < 64 || info.height < 64 || info.width > 8000 || info.height > 8000) throw new ApiError(400, `${file.filename}: недопустимые размеры ${info.width}×${info.height}`);
  if (kind === "icons" && (info.width !== info.height || info.width < 180)) throw new ApiError(400, "Иконка должна быть квадратной, не меньше 180×180 (рекомендуется 1024×1024)");
  const key = `${kind}/${appId}/${file.sha256.slice(0, 32)}.${info.ext}`;
  await putObject("media", key, buf, info.mime, buf.length);
  return { key, ...info };
}
