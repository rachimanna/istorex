// Builds SYNTHETIC test IPAs that exercise the server-side validation pipeline
// (structure, Info.plist, provisioning profile, certificate dates, FairPlay flag, zip attacks).
// They are NOT signed by Apple and will NOT install on a real iPhone — real-device installation
// requires an IPA signed with your Apple Developer certificate (see DEPLOY.md).
// Usage: node tests/make-fixtures.mjs <outDir> <certDerPath>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateRawSync, deflateSync } from "node:zlib";
import plist from "plist";

const [, , outDir = ".dev-data/fixtures", certPath = ".dev-data/fixtures/cert.der"] = process.argv;
mkdirSync(outDir, { recursive: true });
const cert = readFileSync(certPath);

// ── CRC32 + minimal ZIP writer (deflate) ──
const T = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ── Mach-O arm64 executable with LC_ENCRYPTION_INFO_64 ──
function macho(cryptid) {
  const b = Buffer.alloc(4096);
  b.writeUInt32LE(0xfeedfacf, 0); b.writeUInt32LE(0x0100000c, 4); b.writeUInt32LE(0, 8); b.writeUInt32LE(2, 12);
  b.writeUInt32LE(1, 16); b.writeUInt32LE(24, 20);
  b.writeUInt32LE(0x2c, 32); b.writeUInt32LE(24, 36); b.writeUInt32LE(0x4000, 40); b.writeUInt32LE(0x1000, 44); b.writeUInt32LE(cryptid, 48);
  return b;
}

function provision({ expires, devices, allDevices = false, bundle = "com.istorex.demo", getTaskAllow = false }) {
  const p = {
    AppIDName: "Demo",
    Name: "iStoreX Test Profile",
    TeamName: "iStoreX Test Team",
    TeamIdentifier: ["ABCDE12345"],
    CreationDate: new Date(),
    ExpirationDate: expires,
    Entitlements: { "application-identifier": `ABCDE12345.${bundle}`, "get-task-allow": getTaskAllow },
    DeveloperCertificates: [cert],
  };
  if (allDevices) p.ProvisionsAllDevices = true;
  else if (devices) p.ProvisionedDevices = devices;
  // Real profiles are CMS envelopes; the server extracts the embedded XML plist the same way.
  return Buffer.concat([Buffer.from([0x30, 0x80, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]), Buffer.from(plist.build(p)), Buffer.alloc(64, 0xaa)]);
}

function info({ bundle = "com.istorex.demo", version = "1.0.0", build = "1", minOS = "16.0", family = [1, 2] } = {}) {
  return plist.build({
    CFBundleIdentifier: bundle,
    CFBundleDisplayName: "Demo",
    CFBundleName: "Demo",
    CFBundleExecutable: "Demo",
    CFBundleShortVersionString: version,
    CFBundleVersion: build,
    MinimumOSVersion: minOS,
    UIDeviceFamily: family,
    LSRequiresIPhoneOS: true,
  });
}

const DEVICE = "00008110-000A1B2C3D4E5F6A";
const inYear = new Date(Date.now() + 365 * 86400_000);
const lastYear = new Date(Date.now() - 30 * 86400_000);

function ipa({ infoOpts, cryptid = 0, prov, signed = true, extra = [] }) {
  const files = [
    ["Payload/Demo.app/Info.plist", info(infoOpts)],
    ["Payload/Demo.app/Demo", macho(cryptid)],
  ];
  if (signed) files.push(["Payload/Demo.app/_CodeSignature/CodeResources", plist.build({ files: {} })]);
  if (prov) files.push(["Payload/Demo.app/embedded.mobileprovision", prov]);
  return zip([...files, ...extra]);
}

const out = {
  "adhoc-valid.ipa": ipa({ prov: provision({ expires: inYear, devices: [DEVICE, "0123456789ABCDEF0123456789ABCDEF01234567"] }) }),
  "adhoc-valid-v2.ipa": ipa({ infoOpts: { version: "1.1.0", build: "2" }, prov: provision({ expires: inYear, devices: [DEVICE] }) }),
  "adhoc-expired.ipa": ipa({ infoOpts: { version: "0.9.0" }, prov: provision({ expires: lastYear, devices: [DEVICE] }) }),
  "enterprise.ipa": ipa({ infoOpts: { bundle: "com.istorex.inhouse" }, prov: provision({ expires: inYear, allDevices: true, bundle: "com.istorex.inhouse" }) }),
  "bundle-mismatch.ipa": ipa({ infoOpts: { bundle: "com.other.app" }, prov: provision({ expires: inYear, devices: [DEVICE] }) }),
  "sideload-unsigned.ipa": ipa({ infoOpts: { bundle: "com.istorex.sideload", version: "2.0" }, signed: false }),
  "fairplay-encrypted.ipa": ipa({ infoOpts: { bundle: "com.pirated.app" }, cryptid: 1, prov: provision({ expires: inYear, devices: [DEVICE] }) }),
  "with-mobileconfig.ipa": ipa({ prov: provision({ expires: inYear, devices: [DEVICE] }), extra: [["Payload/Demo.app/profile.mobileconfig", "<plist/>"]] }),
  "path-traversal.ipa": zip([["Payload/Demo.app/Info.plist", info()], ["../../evil.sh", "rm -rf /"]]),
  "no-payload.ipa": zip([["readme.txt", "hello"]]),
  "not-a-zip.ipa": Buffer.from("MZ this is actually an exe"),
};
for (const [name, buf] of Object.entries(out)) writeFileSync(`${outDir}/${name}`, buf);

// Test images: square icon + portrait screenshot (real PNGs), and an SVG that must be rejected.
function pngImage(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    raw[o] = rgb[0]; raw[o + 1] = (rgb[1] + y) & 255; raw[o + 2] = rgb[2];
  }
  const chunk = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
writeFileSync(`${outDir}/icon.png`, pngImage(512, 512, [10, 132, 255]));
writeFileSync(`${outDir}/shot1.png`, pngImage(390, 844, [94, 92, 230]));
writeFileSync(`${outDir}/shot2.png`, pngImage(390, 844, [191, 90, 242]));
writeFileSync(`${outDir}/evil.svg`, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
console.log("fixtures:", Object.keys(out).length + 4, "files in", outDir);
