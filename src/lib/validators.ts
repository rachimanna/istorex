import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Нужна ссылка https://");

export const registerSchema = z.object({
  email: z.email("Некорректный email").max(200).transform((v) => v.toLowerCase()),
  password: z.string().min(10, "Пароль — минимум 10 символов").max(200),
  displayName: text(60).min(2, "Имя — минимум 2 символа"),
});

export const loginSchema = z.object({
  email: z.string().trim().max(200).transform((v) => v.toLowerCase()),
  password: z.string().max(200),
});

export const profileSchema = z.object({
  displayName: text(60).min(2).optional(),
  // iPhone UDID: 40 hex chars (older) or 8-16 hex with dash (A12+)
  deviceUdid: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([0-9A-F]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/, "Неверный формат UDID")
    .nullable()
    .or(z.literal("").transform(() => null))
    .optional(),
});

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Только латиница, цифры и дефисы");

export const appSchema = z
  .object({
    slug: slugSchema,
    name: text(80).min(1),
    subtitle: text(120).default(""),
    developer: text(80).min(1),
    description: text(8000).min(1),
    categoryId: z.string().min(1).max(40),
    featured: z.boolean().default(false),
    isModified: z.boolean().default(false),
    originalAppName: text(80).nullable().optional(),
    legalBasis: text(2000).default(""),
    sourceUrl: httpsUrl.nullable().optional().or(z.literal("").transform(() => null)),
    ageRating: z.enum(["4+", "9+", "12+", "17+", "18+"]).default("4+"),
  })
  .refine((a) => !a.isModified || a.legalBasis.length >= 20, {
    message: "Для модифицированной сборки обязательно опишите правовое основание распространения (лицензия, разрешение автора и т.д.)",
    path: ["legalBasis"],
  });

export const appPatchSchema = z.object({
  slug: slugSchema.optional(),
  name: text(80).min(1).optional(),
  subtitle: text(120).optional(),
  developer: text(80).min(1).optional(),
  description: text(8000).min(1).optional(),
  categoryId: z.string().min(1).max(40).optional(),
  featured: z.boolean().optional(),
  isModified: z.boolean().optional(),
  originalAppName: text(80).nullable().optional(),
  legalBasis: text(2000).optional(),
  sourceUrl: httpsUrl.nullable().optional().or(z.literal("").transform(() => null)),
  ageRating: z.enum(["4+", "9+", "12+", "17+", "18+"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN", "TAKEN_DOWN"]).optional(),
});

export const EXTERNAL_DISTRIBUTIONS = ["APP_STORE", "TESTFLIGHT", "EU_WEB_DISTRIBUTION", "ALT_MARKETPLACE"] as const;
export const HOSTED_DISTRIBUTIONS = ["AD_HOC_OTA", "ENTERPRISE_OTA", "IPA_SIDELOAD"] as const;

const externalHosts: Record<string, RegExp> = {
  APP_STORE: /^(apps|itunes)\.apple\.com$/,
  TESTFLIGHT: /^testflight\.apple\.com$/,
};

export const externalReleaseSchema = z
  .object({
    distribution: z.enum(EXTERNAL_DISTRIBUTIONS),
    externalUrl: httpsUrl,
    version: text(40).min(1),
    minIOS: z.string().trim().regex(/^\d+(\.\d+){0,2}$/),
    sizeMb: z.number().min(0).max(100_000).default(0),
    changelog: text(4000).default(""),
  })
  .refine((r) => !externalHosts[r.distribution] || externalHosts[r.distribution]!.test(new URL(r.externalUrl).hostname), {
    message: "Ссылка должна вести на официальный домен Apple (apps.apple.com / testflight.apple.com)",
    path: ["externalUrl"],
  });

export const hostedReleaseFields = z.object({
  distribution: z.enum(HOSTED_DISTRIBUTIONS),
  changelog: text(4000).default(""),
  minIOS: z.string().trim().regex(/^\d+(\.\d+){0,2}$/).optional().or(z.literal("").transform(() => undefined)),
  enterpriseAttested: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export const categorySchema = z.object({
  slug: slugSchema,
  name: text(40).min(1),
  kind: z.enum(["GAME", "APP"]),
  icon: text(8).default("📦"),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const reportSchema = z.object({
  appId: z.string().min(1).max(40),
  reason: z.enum(["COPYRIGHT", "MALWARE", "BROKEN", "MISLEADING", "OTHER"]),
  message: text(3000).min(10, "Опишите проблему (минимум 10 символов)"),
  email: z.email().max(200).optional().or(z.literal("").transform(() => undefined)),
});
