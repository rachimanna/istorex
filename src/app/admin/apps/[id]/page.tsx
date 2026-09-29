import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import { AppForm } from "@/components/admin/AppForm";
import { MediaManager, StatusControls } from "@/components/admin/AppAdmin";
import { ReleaseList, ReleaseUpload } from "@/components/admin/Releases";

export const dynamic = "force-dynamic";

export default async function EditApp({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [app, categories] = await Promise.all([
    db.app.findUnique({ where: { id }, include: { screenshots: { orderBy: { sortOrder: "asc" } }, releases: { orderBy: { createdAt: "desc" } }, category: true } }),
    db.category.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
  ]);
  if (!app) notFound();

  const releases = app.releases.map((r) => ({
    id: r.id,
    version: r.version,
    buildNumber: r.buildNumber,
    distribution: r.distribution,
    state: r.state,
    isCurrent: r.isCurrent,
    signingStatus: r.signingStatus,
    profileType: r.profileType,
    teamName: r.teamName,
    profileExpiresAt: r.profileExpiresAt?.toISOString() ?? null,
    certExpiresAt: r.certExpiresAt?.toISOString() ?? null,
    devices: r.provisionedDevices.length,
    sizeBytes: Number(r.sizeBytes),
    sha256: r.sha256,
    bundleId: r.bundleId,
    minIOS: r.minIOS,
    externalUrl: r.externalUrl,
    enterpriseAttested: r.enterpriseAttested,
    validation: r.validation as { level: string; code: string; message: string }[],
    lastCheckOk: r.lastCheckOk,
    lastCheckError: r.lastCheckError,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="stack">
      <div className="spread">
        <h2 className="title-2">{app.name}</h2>
        {app.status === "PUBLISHED" && <Link href={`/app/${app.slug}`} className="btn">Открыть на сайте ↗</Link>}
      </div>
      <StatusControls id={app.id} status={app.status} name={app.name} />

      <h3 className="headline" style={{ marginTop: 16 }}>Версии и установка</h3>
      <ReleaseUpload appId={app.id} />
      <ReleaseList releases={releases} />

      <h3 className="headline" style={{ marginTop: 16 }}>Иконка и скриншоты</h3>
      <MediaManager
        appId={app.id}
        name={app.name}
        iconUrl={mediaUrl(app.iconKey)}
        screenshots={app.screenshots.map((s) => ({ id: s.id, url: mediaUrl(s.key)!, w: s.width, h: s.height }))}
      />

      <h3 className="headline" style={{ marginTop: 16 }}>Информация</h3>
      <AppForm
        categories={categories.map((c) => ({ id: c.id, name: `${c.icon} ${c.name}` }))}
        initial={{
          id: app.id,
          slug: app.slug,
          name: app.name,
          subtitle: app.subtitle,
          developer: app.developer,
          description: app.description,
          categoryId: app.categoryId,
          featured: app.featured,
          isModified: app.isModified,
          originalAppName: app.originalAppName,
          legalBasis: app.legalBasis,
          sourceUrl: app.sourceUrl,
          ageRating: app.ageRating,
        }}
      />
    </div>
  );
}
