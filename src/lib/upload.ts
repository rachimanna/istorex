import "server-only";
import Busboy from "busboy";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ApiError } from "./http";

export type UploadedFile = {
  field: string;
  filename: string;
  declaredMime: string;
  path: string;
  size: number;
  sha256: string;
};

export type ParsedUpload = { fields: Record<string, string>; files: UploadedFile[]; cleanup: () => Promise<void> };

/**
 * Streams a multipart/form-data request to a temporary directory (never buffers the whole file in memory),
 * enforcing a hard size limit and computing SHA-256 on the fly. Temp files are deleted via cleanup().
 */
export async function parseMultipart(req: Request, opts: { maxFileBytes: number; maxFiles: number; allowedFields: string[] }): Promise<ParsedUpload> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) throw new ApiError(415, "Ожидался multipart/form-data");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared && declared > opts.maxFileBytes + 1024 * 1024) {
    throw new ApiError(413, `Файл больше лимита ${Math.round(opts.maxFileBytes / 1024 / 1024)} МБ`);
  }
  if (!req.body) throw new ApiError(400, "Пустой запрос");

  const dir = await mkdtemp(join(tmpdir(), "istorex-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  const pending: Promise<void>[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({
        headers: { "content-type": ct },
        limits: { fileSize: opts.maxFileBytes, files: opts.maxFiles, fields: 50, fieldSize: 64 * 1024 },
      });
      bb.on("field", (name, value) => {
        if (opts.allowedFields.includes(name)) fields[name] = value;
      });
      bb.on("file", (field, stream, info) => {
        const path = join(dir, `${files.length + pending.length}.bin`);
        const hash = createHash("sha256");
        let size = 0;
        const out = createWriteStream(path);
        pending.push(
          new Promise<void>((res, rej) => {
            stream.on("data", (c: Buffer) => {
              size += c.length;
              hash.update(c);
            });
            stream.on("limit", () => rej(new ApiError(413, `Файл больше лимита ${Math.round(opts.maxFileBytes / 1024 / 1024)} МБ`)));
            out.on("finish", () => {
              files.push({ field, filename: info.filename ?? "file", declaredMime: info.mimeType ?? "", path, size, sha256: hash.digest("hex") });
              res();
            });
            out.on("error", rej);
            stream.pipe(out);
          }),
        );
      });
      bb.on("filesLimit", () => reject(new ApiError(413, "Слишком много файлов в запросе")));
      bb.on("error", reject);
      bb.on("close", () => Promise.all(pending).then(() => resolve(), reject));
      Readable.fromWeb(req.body as import("node:stream/web").ReadableStream).on("error", reject).pipe(bb);
    });
  } catch (e) {
    await cleanup();
    throw e;
  }
  return { fields, files, cleanup };
}
