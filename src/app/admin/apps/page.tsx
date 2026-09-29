import Link from "next/link";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import { AppIcon, DistributionBadge, SigningBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Черновик", ""],
  PUBLISHED: ["Опубликовано", "green"],
  HIDDEN: ["Скрыто", "orange"],
  TAKEN_DOWN: ["Снято по жалобе", "red"],
};

export default async function AdminApps() {
  const apps = await db.app.findMany({
    orderBy: { updatedAt: "desc" },
    include: { category: true, releases: { where: { isCurrent: true }, take: 1 }, _count: { select: { reports: { where: { status: "OPEN" } } } } },
  });
  return (
    <div className="stack">
      <div className="spread">
        <span className="footnote">Всего: {apps.length}</span>
        <Link href="/admin/apps/new" className="btn btn-primary">+ Новое приложение</Link>
      </div>
      <div className="glass" style={{ padding: "4px 14px" }}>
        {apps.length === 0 && <p className="footnote" style={{ padding: 12 }}>Приложений пока нет.</p>}
        {apps.map((a) => {
          const r = a.releases[0];
          const [label, color] = STATUS[a.status]!;
          return (
            <Link key={a.id} href={`/admin/apps/${a.id}`} className="app-row">
              <AppIcon url={mediaUrl(a.iconKey)} name={a.name} size={48} />
              <div className="meta">
                <div className="name">{a.name}</div>
                <div className="sub">{a.category.name} · {r ? `v${r.version}` : "нет текущей версии"}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                  <span className={`badge ${color}`}>{label}</span>
                  {r && <DistributionBadge d={r.distribution} />}
                  {r && <SigningBadge s={r.signingStatus} />}
                  {a._count.reports > 0 && <span className="badge red">Жалоб: {a._count.reports}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
