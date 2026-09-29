import "server-only";

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}
function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

export const env = {
  appUrl: str("APP_URL", "http://localhost:3000").replace(/\/+$/, ""),
  isProd: process.env.NODE_ENV === "production",
  sessionSecret: str("SESSION_SECRET"),
  cronSecret: str("CRON_SECRET"),
  s3: {
    endpoint: str("S3_ENDPOINT"),
    region: str("S3_REGION", "auto"),
    accessKeyId: str("S3_ACCESS_KEY_ID"),
    secretAccessKey: str("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", false),
    bucketIpa: str("S3_BUCKET_IPA", "istorex-ipa"),
    bucketMedia: str("S3_BUCKET_MEDIA", "istorex-media"),
    publicBaseUrl: str("S3_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  },
  limits: {
    maxIpaBytes: int("MAX_IPA_SIZE_MB", 2048) * 1024 * 1024,
    maxImageBytes: int("MAX_IMAGE_SIZE_MB", 8) * 1024 * 1024,
    downloadsPerIpPerDay: int("DOWNLOADS_PER_IP_PER_DAY", 30),
    monthlyEgressBudgetBytes: int("MONTHLY_EGRESS_BUDGET_GB", 500) * 1024 ** 3,
    ipaUrlTtlSeconds: Math.max(60, int("IPA_URL_TTL_SECONDS", 900)),
  },
  allowRegistration: bool("ALLOW_REGISTRATION", true),
  clamav: { host: str("CLAMAV_HOST"), port: int("CLAMAV_PORT", 3310) },
  contactEmail: str("CONTACT_EMAIL", "support@example.com"),
  abuseEmail: str("ABUSE_EMAIL", "abuse@example.com"),
  operatorName: str("OPERATOR_NAME", "iStoreX"),
};

export const appUrlIsHttps = env.appUrl.startsWith("https://");

/** Fail fast in production when required secrets are missing. */
export function assertProductionConfig(): string[] {
  const problems: string[] = [];
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL не задан");
  if (env.sessionSecret.length < 32) problems.push("SESSION_SECRET короче 32 символов");
  if (!env.s3.endpoint || !env.s3.accessKeyId || !env.s3.secretAccessKey) problems.push("S3 хранилище не настроено");
  if (env.isProd && !appUrlIsHttps) problems.push("APP_URL должен начинаться с https:// — iOS не устанавливает приложения по HTTP");
  return problems;
}
