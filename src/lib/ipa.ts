import "server-only";
import { X509Certificate } from "node:crypto";
import { open as openFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import yauzl from "yauzl";
import plist from "plist";
import bplist from "bplist-parser";

export type Finding = { level: "error" | "warning" | "info"; code: string; message: string };

export type IpaReport = {
  ok: boolean;
  findings: Finding[];
  bundleId?: string;
  displayName?: string;
  version?: string;
  buildNumber?: string;
  minIOS?: string;
  supportsIphone: boolean;
  signed: boolean;
  encrypted?: boolean;
  profile?: {
    type: "DEVELOPMENT" | "AD_HOC" | "ENTERPRISE" | "APP_STORE";
    name?: string;
    teamName?: string;
    teamId?: string;
    expiresAt?: Date;
    provisionedDevices: string[];
    appIdentifier?: string;
  };
  certExpiresAt?: Date;
  certSubject?: string;
  signingStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "UNSIGNED" | "INVALID" | "UNKNOWN";
};

const MAX_ENTRIES = 200_000;
const MAX_UNCOMPRESSED = 16 * 1024 ** 3; // 16 GiB
const MAX_RATIO = 200; // zip-bomb guard (per-entry compression ratio)
const MAX_PLIST = 4 * 1024 * 1024;
const MAX_EXEC_SCAN = 256 * 1024 * 1024;
const EXPIRING_DAYS = 14;

const ALLOWED_TOP_LEVEL = /^(Payload\/|SwiftSupport\/|Symbols\/|META-INF\/|WatchKitSupport2?\/|MessagesApplicationExtensionSupport\/|iTunesMetadata\.plist$|iTunesArtwork(@2x)?$|BCSymbolMaps\/)/;

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((res, rej) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: false }, (err, zf) => (err || !zf ? rej(err ?? new Error("zip")) : res(zf))),
  );
}

function readEntry(zf: yauzl.ZipFile, entry: yauzl.Entry, limit: number): Promise<Buffer> {
  return new Promise((res, rej) => {
    zf.openReadStream(entry, (err, stream) => {
      if (err || !stream) return rej(err ?? new Error("stream"));
      const chunks: Buffer[] = [];
      let total = 0;
      (stream as Readable)
        .on("data", (c: Buffer) => {
          total += c.length;
          if (total > limit) {
            (stream as Readable).destroy();
            res(Buffer.concat(chunks));
            return;
          }
          chunks.push(c);
        })
        .on("end", () => res(Buffer.concat(chunks)))
        .on("error", rej);
    });
  });
}

export function parsePlistBuffer(buf: Buffer): Record<string, unknown> {
  if (buf.subarray(0, 8).toString("latin1") === "bplist00") {
    const parsed = bplist.parseBuffer(buf) as unknown[];
    return (parsed[0] ?? {}) as Record<string, unknown>;
  }
  return plist.parse(buf.toString("utf8")) as Record<string, unknown>;
}

/** embedded.mobileprovision is a CMS (PKCS#7) envelope with an XML plist inside. */
export function parseMobileProvision(buf: Buffer): Record<string, unknown> | null {
  const s = buf.toString("latin1");
  const start = s.indexOf("<?xml");
  const end = s.indexOf("</plist>");
  if (start < 0 || end < 0) return null;
  const xml = Buffer.from(s.slice(start, end + 8), "latin1").toString("utf8");
  return plist.parse(xml) as Record<string, unknown>;
}

/** Returns cryptid of the arm64 slice (1 = FairPlay-encrypted App Store binary), or undefined if not determinable. */
export function machoCryptId(buf: Buffer): number | undefined {
  if (buf.length < 32) return undefined;
  const magicBE = buf.readUInt32BE(0);
  if (magicBE === 0xcafebabe || magicBE === 0xcafebabf) {
    const is64 = magicBE === 0xcafebabf;
    const n = buf.readUInt32BE(4);
    let fallback: number | undefined;
    for (let i = 0; i < n && i < 16; i++) {
      const base = 8 + i * (is64 ? 32 : 20);
      if (base + 20 > buf.length) break;
      const cputype = buf.readUInt32BE(base);
      const offset = is64 ? Number(buf.readBigUInt64BE(base + 8)) : buf.readUInt32BE(base + 8);
      if (offset >= buf.length) continue;
      const r = machoCryptId(buf.subarray(offset));
      if (cputype === 0x0100000c) return r; // arm64
      fallback ??= r;
    }
    return fallback;
  }
  const magicLE = buf.readUInt32LE(0);
  const is64 = magicLE === 0xfeedfacf;
  if (!is64 && magicLE !== 0xfeedface) return undefined;
  const ncmds = buf.readUInt32LE(16);
  let off = is64 ? 32 : 28;
  for (let i = 0; i < ncmds && off + 8 <= buf.length; i++) {
    const cmd = buf.readUInt32LE(off);
    const size = buf.readUInt32LE(off + 4);
    if ((cmd === 0x2c || cmd === 0x21) && off + 20 <= buf.length) return buf.readUInt32LE(off + 16);
    if (size < 8) break;
    off += size;
  }
  return 0;
}

function normalizeUdid(u: string) {
  return u.trim().toUpperCase();
}

/** Deep structural / metadata / signing inspection of an IPA stored at a local temp path. */
export async function inspectIpa(path: string, now = new Date()): Promise<IpaReport> {
  const findings: Finding[] = [];
  const report: IpaReport = { ok: false, findings, supportsIphone: false, signed: false, signingStatus: "UNKNOWN" };
  const err = (code: string, message: string) => findings.push({ level: "error", code, message });
  const warn = (code: string, message: string) => findings.push({ level: "warning", code, message });

  // 1. Magic bytes: an IPA is a ZIP archive.
  const fh = await openFile(path, "r");
  const head = Buffer.alloc(4);
  await fh.read(head, 0, 4, 0);
  await fh.close();
  if (head.readUInt32LE(0) !== 0x04034b50) {
    err("NOT_ZIP", "Файл не является ZIP-архивом — это не IPA.");
    return report;
  }

  let zf: yauzl.ZipFile;
  try {
    zf = await openZip(path);
  } catch (e) {
    err("ZIP_CORRUPT", `Архив повреждён: ${(e as Error).message}`);
    return report;
  }

  const appDirs = new Set<string>();
  const wanted = new Map<string, yauzl.Entry>();
  let entries = 0;
  let totalUncompressed = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      zf.on("entry", (e: yauzl.Entry) => {
        entries++;
        const name = e.fileName;
        totalUncompressed += e.uncompressedSize;
        if (entries > MAX_ENTRIES) return reject(new Error(`слишком много файлов (> ${MAX_ENTRIES})`));
        if (totalUncompressed > MAX_UNCOMPRESSED) return reject(new Error("распакованный размер превышает 16 ГБ (возможна zip-бомба)"));
        if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > MAX_RATIO && e.uncompressedSize > 50 * 1024 * 1024) {
          return reject(new Error(`подозрительная степень сжатия у ${name} (возможна zip-бомба)`));
        }
        if (name.includes("\\") || name.split("/").includes("..") || name.startsWith("/")) {
          return reject(new Error(`недопустимый путь в архиве: ${name}`));
        }
        if (/\.mobileconfig$/i.test(name)) {
          err("MOBILECONFIG", `Внутри архива найден профиль конфигурации (${name}). Такие файлы запрещены.`);
        }
        if (!ALLOWED_TOP_LEVEL.test(name) && !name.endsWith("/")) {
          warn("UNEXPECTED_FILE", `Неожиданный файл вне Payload/: ${name}`);
        }
        const m = /^Payload\/([^/]+\.app)\/(.*)$/.exec(name);
        if (m) {
          appDirs.add(m[1]!);
          const rest = m[2]!;
          if (rest === "Info.plist" || rest === "embedded.mobileprovision" || rest === "_CodeSignature/CodeResources") {
            wanted.set(`${m[1]}/${rest}`, e);
          }
        }
        zf.readEntry();
      });
      zf.on("end", () => resolve());
      zf.on("error", reject);
      zf.readEntry();
    });
  } catch (e) {
    err("ZIP_STRUCTURE", `Структура архива отклонена: ${(e as Error).message}`);
    zf.close();
    return report;
  }

  if (appDirs.size === 0) {
    err("NO_APP", "В архиве нет Payload/<Имя>.app — это не IPA-файл iOS.");
    zf.close();
    return report;
  }
  if (appDirs.size > 1) warn("MULTI_APP", `В Payload/ несколько .app: ${[...appDirs].join(", ")}. Используется первый.`);
  const appDir = [...appDirs][0]!;

  // 2. Info.plist
  const infoEntry = wanted.get(`${appDir}/Info.plist`);
  let info: Record<string, unknown> = {};
  if (!infoEntry) {
    err("NO_INFO_PLIST", "Отсутствует Info.plist.");
  } else {
    try {
      info = parsePlistBuffer(await readEntry(zf, infoEntry, MAX_PLIST));
    } catch (e) {
      err("BAD_INFO_PLIST", `Info.plist не читается: ${(e as Error).message}`);
    }
  }
  const s = (k: string) => (typeof info[k] === "string" ? (info[k] as string) : undefined);
  report.bundleId = s("CFBundleIdentifier");
  report.displayName = s("CFBundleDisplayName") ?? s("CFBundleName");
  report.version = s("CFBundleShortVersionString");
  report.buildNumber = s("CFBundleVersion");
  report.minIOS = s("MinimumOSVersion");
  const family = Array.isArray(info.UIDeviceFamily) ? (info.UIDeviceFamily as number[]) : [1];
  report.supportsIphone = family.includes(1);
  if (infoEntry && !report.bundleId) err("NO_BUNDLE_ID", "В Info.plist нет CFBundleIdentifier.");
  if (infoEntry && !report.version) warn("NO_VERSION", "В Info.plist нет CFBundleShortVersionString.");
  if (!report.supportsIphone) err("NOT_IPHONE", "Сборка не поддерживает iPhone (UIDeviceFamily не содержит 1).");
  if (s("LSRequiresIPhoneOS") === undefined && info.LSRequiresIPhoneOS === undefined) warn("NOT_IOS_APP", "Нет ключа LSRequiresIPhoneOS — возможно, это не iOS-приложение.");

  // 3. FairPlay encryption of the main executable.
  const execName = s("CFBundleExecutable");
  if (execName) {
    const execPath = `Payload/${appDir}/${execName}`;
    const execEntry = await findEntry(path, execPath);
    if (execEntry) {
      const zf2 = await openZip(path);
      try {
        const buf = await readEntry(zf2, execEntry, Math.min(MAX_EXEC_SCAN, execEntry.uncompressedSize));
        const cryptid = machoCryptId(buf);
        if (cryptid === undefined) warn("EXEC_UNKNOWN", "Не удалось разобрать исполняемый файл Mach-O.");
        else if (cryptid !== 0) {
          report.encrypted = true;
          err("FAIRPLAY_ENCRYPTED", "Исполняемый файл зашифрован FairPlay (сборка из App Store). Установить её вне App Store невозможно.");
        } else report.encrypted = false;
      } finally {
        zf2.close();
      }
    } else err("NO_EXECUTABLE", `Исполняемый файл ${execName} не найден в .app.`);
  }

  // 4. Code signature + provisioning profile.
  report.signed = wanted.has(`${appDir}/_CodeSignature/CodeResources`);
  const provEntry = wanted.get(`${appDir}/embedded.mobileprovision`);
  if (provEntry) {
    try {
      const prov = parseMobileProvision(await readEntry(zf, provEntry, MAX_PLIST));
      if (!prov) throw new Error("не найден plist внутри CMS");
      const ent = (prov.Entitlements ?? {}) as Record<string, unknown>;
      const devices = Array.isArray(prov.ProvisionedDevices) ? (prov.ProvisionedDevices as string[]).map(normalizeUdid) : [];
      const type = prov.ProvisionsAllDevices === true ? "ENTERPRISE" : devices.length > 0 ? (ent["get-task-allow"] === true ? "DEVELOPMENT" : "AD_HOC") : "APP_STORE";
      report.profile = {
        type,
        name: prov.Name as string | undefined,
        teamName: prov.TeamName as string | undefined,
        teamId: Array.isArray(prov.TeamIdentifier) ? (prov.TeamIdentifier[0] as string) : undefined,
        expiresAt: prov.ExpirationDate instanceof Date ? prov.ExpirationDate : undefined,
        provisionedDevices: devices,
        appIdentifier: ent["application-identifier"] as string | undefined,
      };
      const certs = Array.isArray(prov.DeveloperCertificates) ? (prov.DeveloperCertificates as Buffer[]) : [];
      for (const der of certs) {
        try {
          const c = new X509Certificate(Buffer.from(der));
          const to = new Date(c.validTo);
          if (!report.certExpiresAt || to > report.certExpiresAt) {
            report.certExpiresAt = to;
            report.certSubject = c.subject.split("\n").find((l) => l.startsWith("CN="))?.slice(3);
          }
        } catch {
          warn("BAD_CERT", "Один из сертификатов в профиле не читается.");
        }
      }
      // application-identifier = TEAMID.bundle.id or TEAMID.* (wildcard)
      const appId = report.profile.appIdentifier;
      if (appId && report.bundleId) {
        const pattern = appId.slice(appId.indexOf(".") + 1);
        const matches = pattern === "*" || pattern === report.bundleId || (pattern.endsWith(".*") && report.bundleId.startsWith(pattern.slice(0, -1)));
        if (!matches) err("BUNDLE_MISMATCH", `Bundle ID ${report.bundleId} не соответствует профилю (${appId}).`);
      }
    } catch (e) {
      err("BAD_PROVISION", `embedded.mobileprovision не читается: ${(e as Error).message}`);
    }
  }
  zf.close();

  // 5. Signing status (profile + certificate validity dates). Revocation (OCSP) is NOT checked here.
  if (!report.signed) report.signingStatus = "UNSIGNED";
  else if (!report.profile) report.signingStatus = "INVALID";
  else if (findings.some((f) => f.code === "BUNDLE_MISMATCH" || f.code === "BAD_PROVISION")) report.signingStatus = "INVALID";
  else {
    const exp = [report.profile.expiresAt, report.certExpiresAt].filter((d): d is Date => !!d);
    const earliest = exp.length ? new Date(Math.min(...exp.map((d) => d.getTime()))) : undefined;
    if (!earliest) report.signingStatus = "UNKNOWN";
    else if (earliest <= now) report.signingStatus = "EXPIRED";
    else if (earliest.getTime() - now.getTime() < EXPIRING_DAYS * 86400_000) report.signingStatus = "EXPIRING_SOON";
    else report.signingStatus = "VALID";
  }

  report.ok = !findings.some((f) => f.level === "error");
  return report;
}

async function findEntry(path: string, fileName: string): Promise<yauzl.Entry | undefined> {
  const zf = await openZip(path);
  try {
    return await new Promise<yauzl.Entry | undefined>((resolve, reject) => {
      zf.on("entry", (e: yauzl.Entry) => (e.fileName === fileName ? resolve(e) : zf.readEntry()));
      zf.on("end", () => resolve(undefined));
      zf.on("error", reject);
      zf.readEntry();
    });
  } finally {
    zf.close();
  }
}

/** Distribution-specific checks: is this build actually installable via the chosen mechanism? */
export function checkDistributionFit(r: IpaReport, distribution: string): Finding[] {
  const out: Finding[] = [];
  const e = (code: string, message: string) => out.push({ level: "error", code, message });
  if (distribution === "AD_HOC_OTA" || distribution === "ENTERPRISE_OTA") {
    if (!r.signed || !r.profile) e("OTA_UNSIGNED", "Для установки через itms-services нужна подписанная сборка с embedded.mobileprovision.");
    else if (distribution === "AD_HOC_OTA" && !["AD_HOC", "DEVELOPMENT"].includes(r.profile.type))
      e("PROFILE_TYPE", `Профиль типа ${r.profile.type} не подходит для Ad Hoc. Нужен Ad Hoc (или Development) профиль со списком UDID.`);
    else if (distribution === "ENTERPRISE_OTA" && r.profile.type !== "ENTERPRISE")
      e("PROFILE_TYPE", `Профиль типа ${r.profile.type} не является In-House (Enterprise).`);
    if (r.signingStatus === "EXPIRED") e("EXPIRED", "Срок действия профиля или сертификата истёк — iOS откажется устанавливать.");
  }
  if (distribution === "AD_HOC_OTA" && r.profile?.type === "DEVELOPMENT") {
    out.push({ level: "warning", code: "DEV_MODE", message: "Development-профиль: на iOS 16+ пользователю понадобится включить Режим разработчика." });
  }
  return out;
}
