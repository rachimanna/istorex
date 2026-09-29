import "server-only";
import { createReadStream } from "node:fs";
import net from "node:net";
import { env } from "./env";

export type ScanResult = { scanned: boolean; clean: boolean; signature?: string; error?: string };

/** Streams a file to clamd using the INSTREAM protocol. Disabled when CLAMAV_HOST is empty. */
export async function scanFile(path: string): Promise<ScanResult> {
  if (!env.clamav.host) return { scanned: false, clean: true };
  return new Promise((resolve) => {
    const sock = net.connect(env.clamav.port, env.clamav.host);
    let reply = "";
    sock.setTimeout(10 * 60 * 1000);
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ scanned: false, clean: false, error: "ClamAV: таймаут" });
    });
    sock.on("error", (e) => resolve({ scanned: false, clean: false, error: `ClamAV: ${e.message}` }));
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => {
      const r = reply.replace(/\0/g, "").trim();
      if (r.endsWith("OK")) resolve({ scanned: true, clean: true });
      else if (r.includes("FOUND")) resolve({ scanned: true, clean: false, signature: r.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, "") });
      else resolve({ scanned: false, clean: false, error: `ClamAV: ${r || "нет ответа"}` });
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      const rs = createReadStream(path, { highWaterMark: 64 * 1024 });
      rs.on("data", (chunk) => {
        const buf = chunk as Buffer;
        const len = Buffer.alloc(4);
        len.writeUInt32BE(buf.length);
        if (!sock.write(Buffer.concat([len, buf]))) {
          rs.pause();
          sock.once("drain", () => rs.resume());
        }
      });
      rs.on("end", () => sock.write(Buffer.alloc(4)));
      rs.on("error", (e) => {
        sock.destroy();
        resolve({ scanned: false, clean: false, error: e.message });
      });
    });
  });
}
