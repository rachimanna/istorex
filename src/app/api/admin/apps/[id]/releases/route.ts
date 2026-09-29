import { createReadStream } from "node:fs";
import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { scanFile } from "@/lib/clamav";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { api, ApiError, json, readJson } from "@/lib/http";
import { checkDistributionFit, inspectIpa, type Finding } from "@/lib/ipa";
import { audit } from "@/lib/log";
import { makeCurrent, serializeRelease } from "@/lib/releases";
import { clientIp } from "@/lib/security";
import { putObject } from "@/lib/storage";
import { parseMultipart } from "@/lib/upload";
import { externalReleaseSchema, hostedReleaseFields } from "@/lib/validators";

export const dynamic = "force-dynamic";
export const maxDuration = 900;
type Ctx = { params: Promise<{ id: string }> };

const IPA_MIME = new Set(["", "application/octet-stream", "application/x-itunes-ipa", "application/zip", "application/x-zip-compressed", "application/x-ios-app"]);

export const POST = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id: appId } = await params;
  const app = await db.app.findUnique({ where: { id: appId }, select: { id: true, slug: true } });
  if (!app) throw new ApiError(404, "Приложение не найдено");
  const ip = clientIp(req);

  // ── External release: App Store / TestFlight / EU Web Distribution / alternative marketplace ──
  if ((req.headers.get("content-type") ?? "").startsWith("application/json")) {
    const body = (await readJson(req)) as Record<string, unknown>;
    const data = externalReleaseSchema.parse(body);
    const release = await db.release.create({
      data: {
        appId,
        distribution: data.distribution,
        externalUrl: data.externalUrl,
        version: data.version,
        minIOS: data.minIOS,
        sizeBytes: BigInt(Math.round(data.sizeMb * 1024 * 1024)),
        changelog: data.changelog,
        state: "READY",
        signingStatus: "NOT_APPLICABLE",
        validation: [],
      },
    });
    if (body.makeCurrent !== false) await makeCurrent(release.id, appId);
    await audit(admin.id, "release.create.external", "release", release.id, { appId, distribution: data.distribution, version: data.version }, ip);
    invalidateCatalog();
    return json(serializeRelease(release), { status: 201 });
  }

  // ── Hosted IPA upload ──
  const up = await parseMultipart(req, {
    maxFileBytes: env.limits.maxIpaBytes,
    maxFiles: 1,
    allowedFields: ["distribution", "changelog", "minIOS", "enterpriseAttested", "makeCurrent"],
  });
  try {
    const fields = hostedReleaseFields.parse(up.fields);
    const file = up.files[0];
    if (!file || file.size === 0) throw new ApiError(400, "IPA-файл не передан");

    const findings: Finding[] = [];
    if (!/\.ipa$/i.test(file.filename)) findings.push({ level: "error", code: "EXTENSION", message: "Расширение файла должно быть .ipa" });
    if (!IPA_MIME.has(file.declaredMime.toLowerCase())) findings.push({ level: "error", code: "MIME", message: `Недопустимый MIME-тип: ${file.declaredMime}` });

    const report = await inspectIpa(file.path);
    findings.push(...report.findings, ...checkDistributionFit(report, fields.distribution));
    if (fields.distribution === "ENTERPRISE_OTA" && !fields.enterpriseAttested) {
      findings.push({ level: "error", code: "ENTERPRISE_ATTEST", message: "Подтвердите, что Enterprise-сборка распространяется только среди сотрудников вашей организации (правила Apple Developer Enterprise Program)." });
    }

    const scan = await scanFile(file.path);
    if (!scan.clean) findings.push({ level: "error", code: "MALWARE", message: scan.signature ? `Антивирус обнаружил угрозу: ${scan.signature}` : `Антивирусная проверка не выполнена: ${scan.error}` });
    else if (!scan.scanned) findings.push({ level: "info", code: "NO_AV", message: "Антивирусная проверка отключена (CLAMAV_HOST не задан)." });

    const dup = await db.release.findFirst({ where: { appId, sha256: file.sha256, state: "READY" }, select: { version: true } });
    if (dup) findings.push({ level: "error", code: "DUPLICATE", message: `Этот файл уже загружен (версия ${dup.version}).` });

    const failed = findings.some((f) => f.level === "error");
    const base = {
      appId,
      distribution: fields.distribution,
      version: report.version ?? "?",
      buildNumber: report.buildNumber ?? "",
      minIOS: fields.minIOS ?? report.minIOS ?? "15.0",
      changelog: fields.changelog,
      sizeBytes: BigInt(file.size),
      sha256: file.sha256,
      bundleId: report.bundleId,
      supportsIphone: report.supportsIphone,
      signingStatus: report.signingStatus,
      profileType: report.profile?.type ?? "NONE",
      teamName: report.profile?.teamName,
      teamId: report.profile?.teamId,
      profileExpiresAt: report.profile?.expiresAt,
      certExpiresAt: report.certExpiresAt,
      provisionedDevices: report.profile?.provisionedDevices ?? [],
      enterpriseAttested: fields.enterpriseAttested,
      validation: findings,
    } as const;

    if (failed) {
      // Keep the failed attempt (without the file) so admins can see file errors in the panel.
      const release = await db.release.create({ data: { ...base, state: "FAILED" } });
      await audit(admin.id, "release.upload.rejected", "release", release.id, { appId, sha256: file.sha256, errors: findings.filter((f) => f.level === "error").map((f) => f.code) }, ip);
      return json({ error: "IPA не прошёл проверку", release: serializeRelease(release), findings }, { status: 422 });
    }

    const key = `ipa/${appId}/${file.sha256}.ipa`;
    await putObject("ipa", key, createReadStream(file.path), "application/octet-stream", file.size);
    const release = await db.release.create({ data: { ...base, ipaKey: key, state: "READY", lastCheckAt: new Date(), lastCheckOk: true } });
    if (up.fields.makeCurrent !== "false") await makeCurrent(release.id, appId);
    await audit(admin.id, "release.upload", "release", release.id, { appId, version: release.version, sha256: file.sha256, size: file.size, distribution: fields.distribution }, ip);
    invalidateCatalog();
    return json({ release: serializeRelease(release), findings }, { status: 201 });
  } finally {
    await up.cleanup();
  }
});
