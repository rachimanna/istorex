// Generates the PWA / apple-touch icons (gradient squircle-free square with an "X" glyph) as real PNGs.
// Pure Node (zlib) — no image libraries needed.  Usage: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  const stroke = size * 0.085;
  const m = size * 0.3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      // #0a84ff → #5e5ce6 → #bf5af2
      let r, g, b;
      if (t < 0.5) [r, g, b] = [mix(10, 94, t * 2), mix(132, 92, t * 2), mix(255, 230, t * 2)];
      else [r, g, b] = [mix(94, 191, (t - 0.5) * 2), mix(92, 90, (t - 0.5) * 2), mix(230, 242, (t - 0.5) * 2)];
      // soft top highlight ("glass")
      const hl = Math.max(0, 1 - Math.hypot(x - size * 0.75, y) / (size * 0.9)) * 0.35;
      r = mix(r, 255, hl); g = mix(g, 255, hl); b = mix(b, 255, hl);
      // "X" glyph: distance to both diagonals inside the margin box
      if (x > m && x < size - m && y > m && y < size - m) {
        const d1 = Math.abs(x - y) / Math.SQRT2;
        const d2 = Math.abs(x + y - size) / Math.SQRT2;
        const d = Math.min(d1, d2);
        if (d < stroke / 2) [r, g, b] = [255, 255, 255];
        else if (d < stroke / 2 + 1.2) { const a = 1 - (d - stroke / 2) / 1.2; r = mix(r, 255, a); g = mix(g, 255, a); b = mix(b, 255, a); }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(`public/icons/${name}`, png(size));
  console.log("wrote public/icons/" + name);
}
