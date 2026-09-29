import Link from "next/link";
import type { AppCard } from "@/lib/catalog";
import { DISTRIBUTION_LABEL, SIGNING_LABEL, type Distribution, type SigningStatus } from "@/lib/shared/install";

const GRADIENTS = [
  "linear-gradient(135deg,#0a84ff,#5e5ce6)",
  "linear-gradient(135deg,#ff375f,#ff9f0a)",
  "linear-gradient(135deg,#30d158,#0a84ff)",
  "linear-gradient(135deg,#bf5af2,#ff375f)",
  "linear-gradient(135deg,#ff9f0a,#ffd60a)",
  "linear-gradient(135deg,#64d2ff,#5e5ce6)",
];

export function AppIcon({ url, name, size = 60 }: { url: string | null; name: string; size?: number }) {
  const g = GRADIENTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
  return (
    <div className="app-icon" style={{ width: size, height: size, background: url ? undefined : g, fontSize: size * 0.42 }}>
      {url ? <img src={url} alt="" width={size} height={size} loading="lazy" /> : name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function DistributionBadge({ d }: { d: string | null }) {
  if (!d) return null;
  const color = d === "APP_STORE" || d === "TESTFLIGHT" ? "blue" : d === "IPA_SIDELOAD" ? "purple" : d === "ENTERPRISE_OTA" ? "orange" : "";
  return <span className={`badge ${color}`}>{DISTRIBUTION_LABEL[d as Distribution] ?? d}</span>;
}

export function SigningBadge({ s }: { s: string | null }) {
  if (!s) return null;
  const color = s === "VALID" || s === "NOT_APPLICABLE" ? "green" : s === "EXPIRING_SOON" || s === "UNKNOWN" ? "orange" : "red";
  return <span className={`badge ${color}`}>{SIGNING_LABEL[s as SigningStatus] ?? s}</span>;
}

export function AppRow({ app, rank }: { app: AppCard; rank?: number }) {
  return (
    <Link href={`/app/${app.slug}`} className="app-row">
      {rank !== undefined && <span className="headline muted" style={{ width: 18, textAlign: "center" }}>{rank}</span>}
      <AppIcon url={app.iconUrl} name={app.name} size={60} />
      <div className="meta">
        <div className="name">{app.name}</div>
        <div className="sub">{app.subtitle || app.category.name}</div>
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {app.isModified && <span className="badge purple">Мод</span>}
          <DistributionBadge d={app.distribution} />
        </div>
      </div>
      <span className="btn">Открыть</span>
    </Link>
  );
}

/** Horizontal paged list of app rows, 3 per column — like the App Store. */
export function AppShelf({ title, apps, href, ranked }: { title: string; apps: AppCard[]; href?: string; ranked?: boolean }) {
  if (!apps.length) return null;
  const cols: AppCard[][] = [];
  for (let i = 0; i < apps.length; i += 3) cols.push(apps.slice(i, i + 3));
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="title-2">{title}</h2>
        {href && <Link href={href} className="subhead" style={{ color: "var(--accent)" }}>См. все</Link>}
      </div>
      <div className="hscroll cols">
        {cols.map((col, ci) => (
          <div key={ci} className="glass">
            {col.map((a, i) => <AppRow key={a.id} app={a} rank={ranked ? ci * 3 + i + 1 : undefined} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

export function AppList({ apps }: { apps: AppCard[] }) {
  if (!apps.length) {
    return (
      <div className="empty glass">
        <div className="emoji">🔍</div>
        <p className="headline">Ничего не найдено</p>
        <p className="footnote">Попробуйте изменить запрос или фильтры.</p>
      </div>
    );
  }
  return <div className="glass" style={{ padding: "4px 14px" }}>{apps.map((a) => <AppRow key={a.id} app={a} />)}</div>;
}

export function Pagination({ page, pages, makeHref }: { page: number; pages: number; makeHref: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Страницы">
      {page > 1 ? <Link className="btn btn-glass" href={makeHref(page - 1)}>← Назад</Link> : <span className="btn btn-glass" aria-disabled="true">← Назад</span>}
      <span className="footnote">{page} из {pages}</span>
      {page < pages ? <Link className="btn btn-glass" href={makeHref(page + 1)}>Далее →</Link> : <span className="btn btn-glass" aria-disabled="true">Далее →</span>}
    </nav>
  );
}

export function buildQuery(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
