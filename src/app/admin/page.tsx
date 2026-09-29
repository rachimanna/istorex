import Link from "next/link";
import { monthlyEgressBytes } from "@/lib/catalog";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/shared/format";
import { CheckButton } from "@/components/admin/AdminActions";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const now = Date.now();
  const d1 = new Date(now - 86400_000);
  const d30 = new Date(now - 30 * 86400_000);
  const d14 = new Date(now - 13 * 86400_000);
  d14.setUTCHours(0, 0, 0, 0);

  const [published, totalApps, users, dl24, dl30, openReports, failed, egress, daily, top] = await Promise.all([
    db.app.count({ where: { status: "PUBLISHED" } }),
    db.app.count(),
    db.user.count(),
    db.downloadEvent.count({ where: { createdAt: { gte: d1 } } }),
    db.downloadEvent.count({ where: { createdAt: { gte: d30 } } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.release.count({ where: { OR: [{ state: "FAILED" }, { isCurrent: true, lastCheckOk: false }, { isCurrent: true, signingStatus: { in: ["EXPIRED", "EXPIRING_SOON"] } }] } }),
    monthlyEgressBytes(),
    // Parameterised raw SQL (Prisma tagged template) — no string concatenation.
    db.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*) AS n
      FROM "DownloadEvent" WHERE "createdAt" >= ${d14}
      GROUP BY 1 ORDER BY 1`,
    db.downloadEvent.groupBy({ by: ["appId"], where: { createdAt: { gte: d30 } }, _count: { _all: true }, orderBy: { _count: { appId: "desc" } }, take: 8 }),
  ]);
  const topApps = await db.app.findMany({ where: { id: { in: top.map((t) => t.appId) } }, select: { id: true, name: true, slug: true } });
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(d14.getTime() + i * 86400_000);
    const row = daily.find((r) => new Date(r.day).toISOString().slice(0, 10) === d.toISOString().slice(0, 10));
    return { label: d.toISOString().slice(5, 10), n: Number(row?.n ?? 0) };
  });
  const max = Math.max(1, ...days.map((d) => d.n));
  const budget = env.limits.monthlyEgressBudgetBytes;
  const egressPct = budget ? Math.min(100, (Number(egress) / budget) * 100) : 0;

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 8 }}>
        <Link href="/admin/apps/new" className="btn btn-primary btn-large" style={{ flex: "1 1 200px" }}>+ Добавить приложение</Link>
        <Link href="/admin/apps" className="btn btn-glass btn-large" style={{ flex: "1 1 200px" }}>Все приложения</Link>
      </div>
      <div className="kpis">
        <div className="glass kpi"><div className="v">{published}<span className="footnote"> / {totalApps}</span></div><div className="k">Опубликовано / всего</div></div>
        <div className="glass kpi"><div className="v">{users}</div><div className="k">Пользователей</div></div>
        <div className="glass kpi"><div className="v">{dl24}</div><div className="k">Загрузок за 24 ч</div></div>
        <div className="glass kpi"><div className="v">{dl30}</div><div className="k">Загрузок за 30 дней</div></div>
        <Link href="/admin/reports" className="glass kpi" style={{ color: "inherit" }}><div className="v" style={{ color: openReports ? "var(--red)" : undefined }}>{openReports}</div><div className="k">Открытых жалоб</div></Link>
        <Link href="/admin/issues" className="glass kpi" style={{ color: "inherit" }}><div className="v" style={{ color: failed ? "var(--orange)" : undefined }}>{failed}</div><div className="k">Проблем со сборками</div></Link>
        <div className="glass kpi" style={{ gridColumn: "span 2" }}>
          <div className="v">{formatBytes(Number(egress))}</div>
          <div className="k">Трафик IPA в этом месяце {budget ? `из ${formatBytes(budget)}` : "(без лимита)"}</div>
          {budget > 0 && <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${egressPct}%`, background: egressPct > 85 ? "var(--red)" : undefined }} /></div>}
        </div>
      </div>

      <div className="glass card">
        <div className="spread"><h2 className="title-2">Загрузки за 14 дней</h2><span className="footnote">реальные события</span></div>
        <div className="bars" style={{ marginTop: 12 }} aria-label="График загрузок">
          {days.map((d) => <div key={d.label} title={`${d.label}: ${d.n}`} style={{ height: `${(d.n / max) * 100}%` }} />)}
        </div>
        <div className="spread caption" style={{ marginTop: 4 }}><span>{days[0]!.label}</span><span>{days[13]!.label}</span></div>
      </div>

      <div className="glass card">
        <h2 className="title-2" style={{ marginBottom: 8 }}>Топ за 30 дней</h2>
        {top.length === 0 && <p className="footnote">Загрузок пока нет.</p>}
        <table className="table">
          <tbody>
            {top.map((t) => {
              const a = topApps.find((x) => x.id === t.appId);
              return <tr key={t.appId}><td><Link href={`/admin/apps/${t.appId}`}>{a?.name ?? t.appId}</Link></td><td style={{ textAlign: "right" }}>{t._count._all}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="glass card stack">
        <h2 className="title-2">Проверка доступности</h2>
        <p className="footnote" style={{ margin: 0 }}>Проверяет, что файлы текущих сборок есть в хранилище, внешние ссылки открываются, и пересчитывает статус подписи по датам. Запускается также по cron.</p>
        <CheckButton />
      </div>
    </div>
  );
}
