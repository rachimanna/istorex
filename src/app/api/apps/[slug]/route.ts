import { getCurrentUser } from "@/lib/auth";
import { getAppBySlug, hostedDeliveryBlockers, toPublicRelease } from "@/lib/catalog";
import { api, ApiError, json } from "@/lib/http";
import { mediaUrl } from "@/lib/storage";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = api(async (_req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const app = await getAppBySlug(slug);
  if (!app) throw new ApiError(404, "Приложение не найдено");
  const user = await getCurrentUser();
  const serverBlockers = await hostedDeliveryBlockers();
  const current = app.releases.find((r) => r.isCurrent);
  return json({
    id: app.id,
    slug: app.slug,
    name: app.name,
    subtitle: app.subtitle,
    developer: app.developer,
    description: app.description,
    category: { slug: app.category.slug, name: app.category.name },
    iconUrl: mediaUrl(app.iconKey),
    screenshots: app.screenshots.map((s) => ({ url: mediaUrl(s.key), width: s.width, height: s.height })),
    isModified: app.isModified,
    originalAppName: app.originalAppName,
    ageRating: app.ageRating,
    downloads: app.downloadCount,
    updatedAt: app.updatedAt,
    current: current ? toPublicRelease(current, { userUdid: user?.deviceUdid ?? null, serverBlockers }) : null,
    history: app.releases.filter((r) => r.state === "READY").map((r) => ({ version: r.version, date: r.createdAt, changelog: r.changelog })),
  });
});
