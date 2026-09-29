import "server-only";
import type { Prisma, Release } from "@prisma/client";
import { cached } from "./cache";
import { db } from "./db";
import { env } from "./env";
import { mediaUrl } from "./storage";
import type { PublicRelease } from "./shared/install";

export const PAGE_SIZE = 24;

export type AppCard = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  developer: string;
  iconUrl: string | null;
  category: { slug: string; name: string; kind: "GAME" | "APP" };
  isModified: boolean;
  version: string | null;
  distribution: string | null;
  signingStatus: string | null;
  updatedAt: string;
};

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  subtitle: true,
  developer: true,
  iconKey: true,
  isModified: true,
  updatedAt: true,
  category: { select: { slug: true, name: true, kind: true } },
  releases: { where: { isCurrent: true }, take: 1, select: { version: true, distribution: true, signingStatus: true } },
} satisfies Prisma.AppSelect;

type CardRow = Prisma.AppGetPayload<{ select: typeof cardSelect }>;

function toCard(a: CardRow): AppCard {
  const r = a.releases[0];
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    subtitle: a.subtitle,
    developer: a.developer,
    iconUrl: mediaUrl(a.iconKey),
    category: a.category,
    isModified: a.isModified,
    version: r?.version ?? null,
    distribution: r?.distribution ?? null,
    signingStatus: r?.signingStatus ?? null,
    updatedAt: a.updatedAt.toISOString(),
  };
}

export type CatalogQuery = {
  q?: string;
  kind?: "GAME" | "APP";
  category?: string;
  distribution?: string;
  modified?: boolean;
  installable?: boolean;
  sort?: "popular" | "new" | "updated" | "name";
  page?: number;
};

export async function listApps(query: CatalogQuery) {
  const page = Math.max(1, Math.min(500, query.page ?? 1));
  const key = `list:${JSON.stringify({ ...query, page })}`;
  return cached(key, 30_000, async () => {
    const where: Prisma.AppWhereInput = { status: "PUBLISHED" };
    const and: Prisma.AppWhereInput[] = [];
    if (query.q) {
      const q = query.q.slice(0, 80);
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { developer: { contains: q, mode: "insensitive" } },
          { subtitle: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (query.kind) and.push({ category: { kind: query.kind } });
    if (query.category) and.push({ category: { slug: query.category } });
    if (query.modified !== undefined) and.push({ isModified: query.modified });
    if (query.distribution) and.push({ releases: { some: { isCurrent: true, distribution: query.distribution as never } } });
    if (query.installable)
      and.push({ releases: { some: { isCurrent: true, state: "READY", signingStatus: { in: ["VALID", "EXPIRING_SOON", "NOT_APPLICABLE"] } } } });
    if (and.length) where.AND = and;

    const orderBy: Prisma.AppOrderByWithRelationInput[] =
      query.sort === "new" ? [{ publishedAt: "desc" }] : query.sort === "updated" ? [{ updatedAt: "desc" }] : query.sort === "name" ? [{ name: "asc" }] : [{ downloadCount: "desc" }, { publishedAt: "desc" }];

    const [total, rows] = await Promise.all([
      db.app.count({ where }),
      db.app.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: cardSelect }),
    ]);
    return { items: rows.map(toCard), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function homeSections() {
  return cached("home", 30_000, async () => {
    const base = { status: "PUBLISHED" as const };
    const [featured, popular, fresh, updated, games, categories] = await Promise.all([
      db.app.findMany({ where: { ...base, featured: true }, orderBy: { updatedAt: "desc" }, take: 6, select: cardSelect }),
      db.app.findMany({ where: base, orderBy: [{ downloadCount: "desc" }], take: 10, select: cardSelect }),
      db.app.findMany({ where: base, orderBy: { publishedAt: "desc" }, take: 10, select: cardSelect }),
      db.app.findMany({ where: { ...base, releases: { some: { isCurrent: true } } }, orderBy: { updatedAt: "desc" }, take: 10, select: cardSelect }),
      db.app.findMany({ where: { ...base, category: { kind: "GAME" } }, orderBy: [{ downloadCount: "desc" }], take: 10, select: cardSelect }),
      listCategories(),
    ]);
    return { featured: featured.map(toCard), popular: popular.map(toCard), fresh: fresh.map(toCard), updated: updated.map(toCard), games: games.map(toCard), categories };
  });
}

export async function listCategories(kind?: "GAME" | "APP") {
  return cached(`cats:${kind ?? "all"}`, 60_000, async () => {
    const cats = await db.category.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { apps: { where: { status: "PUBLISHED" } } } } },
    });
    return cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, kind: c.kind, icon: c.icon, count: c._count.apps }));
  });
}

export async function getAppBySlug(slug: string) {
  const app = await db.app.findUnique({
    where: { slug },
    include: {
      category: true,
      screenshots: { orderBy: { sortOrder: "asc" } },
      releases: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!app || app.status !== "PUBLISHED") return null;
  return app;
}

/** Recommendations: same category, popular, excluding the app itself. */
export async function similarApps(appId: string, categoryId: string) {
  return cached(`similar:${appId}`, 60_000, async () => {
    const rows = await db.app.findMany({
      where: { status: "PUBLISHED", categoryId, id: { not: appId } },
      orderBy: { downloadCount: "desc" },
      take: 8,
      select: cardSelect,
    });
    return rows.map(toCard);
  });
}

// ─── Delivery guards (cost control) ───

export async function monthlyEgressBytes(): Promise<bigint> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const agg = await db.downloadEvent.aggregate({ _sum: { bytes: true }, where: { createdAt: { gte: start } } });
  return agg._sum.bytes ?? BigInt(0);
}

export async function hostedDeliveryBlockers(): Promise<string[]> {
  return cached("egress", 60_000, async () => {
    if (!env.limits.monthlyEgressBudgetBytes) return [];
    const used = await monthlyEgressBytes();
    return used >= BigInt(env.limits.monthlyEgressBudgetBytes)
      ? ["Месячный лимит трафика сервиса исчерпан — скачивание файлов с iStoreX временно приостановлено до начала следующего месяца."]
      : [];
  });
}

export function toPublicRelease(r: Release, opts: { userUdid: string | null; serverBlockers: string[] }): PublicRelease {
  const hosted = r.distribution === "AD_HOC_OTA" || r.distribution === "ENTERPRISE_OTA" || r.distribution === "IPA_SIDELOAD";
  const blockers = hosted ? [...opts.serverBlockers] : [];
  if (hosted && r.lastCheckOk === false) blockers.push("Файл сборки сейчас недоступен в хранилище. Администратор уведомлён.");
  if (r.distribution === "ENTERPRISE_OTA" && !r.enterpriseAttested) blockers.push("Enterprise-сборка не подтверждена администратором.");
  const udid = opts.userUdid?.trim().toUpperCase() ?? null;
  return {
    id: r.id,
    version: r.version,
    buildNumber: r.buildNumber,
    minIOS: r.minIOS,
    sizeBytes: Number(r.sizeBytes),
    distribution: r.distribution,
    externalUrl: r.externalUrl,
    signingStatus: r.signingStatus,
    profileType: r.profileType,
    teamName: r.teamName,
    profileExpiresAt: r.profileExpiresAt?.toISOString() ?? null,
    provisionedDeviceCount: r.provisionedDevices.length,
    udidRegistered: r.distribution === "AD_HOC_OTA" && udid ? r.provisionedDevices.includes(udid) : null,
    supportsIphone: r.supportsIphone,
    hasFile: !!r.ipaKey,
    sha256: r.sha256,
    ready: r.state === "READY",
    serverBlockers: blockers,
  };
}
