import { cached } from "@/lib/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mediaUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
const abs = (u: string | null) => (u ? (u.startsWith("http") ? u : `${env.appUrl}${u}`) : undefined);

/**
 * AltStore / SideStore source feed. Lists IPA_SIDELOAD builds: the user's AltStore/SideStore signs
 * them with the user's own Apple ID on install — a real, supported sideloading path.
 */
export async function GET() {
  const data = await cached("altstore", 60_000, async () => {
    const apps = await db.app.findMany({
      where: { status: "PUBLISHED", releases: { some: { distribution: "IPA_SIDELOAD", state: "READY", isCurrent: true } } },
      include: { screenshots: { orderBy: { sortOrder: "asc" } }, releases: { where: { distribution: "IPA_SIDELOAD", state: "READY" }, orderBy: { createdAt: "desc" }, take: 5 } },
    });
    return {
      name: env.operatorName,
      identifier: `${new URL(env.appUrl).hostname}.source`,
      subtitle: "Источник iStoreX для AltStore / SideStore",
      website: env.appUrl,
      iconURL: `${env.appUrl}/icons/icon-512.png`,
      apps: apps
        .filter((a) => a.releases[0]?.bundleId)
        .map((a) => ({
          name: a.name,
          bundleIdentifier: a.releases[0]!.bundleId!,
          developerName: a.developer,
          subtitle: a.subtitle,
          localizedDescription: a.description,
          iconURL: abs(mediaUrl(a.iconKey)),
          tintColor: "0A84FF",
          screenshots: a.screenshots.map((s) => ({ imageURL: abs(mediaUrl(s.key)), width: s.width, height: s.height })),
          versions: a.releases.map((r) => ({
            version: r.version,
            buildVersion: r.buildNumber || undefined,
            date: r.createdAt.toISOString(),
            localizedDescription: r.changelog,
            downloadURL: `${env.appUrl}/api/releases/${r.id}/download`,
            size: Number(r.sizeBytes),
            minOSVersion: r.minIOS,
          })),
          appPermissions: { entitlements: [], privacy: {} },
        })),
      news: [],
    };
  });
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=60" } });
}
