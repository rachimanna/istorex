import Link from "next/link";
import { listApps, listCategories, type CatalogQuery } from "@/lib/catalog";
import { DISTRIBUTION_LABEL } from "@/lib/shared/install";
import { AppList, buildQuery, Pagination } from "./ui";
import { FilterSelect } from "./FilterSelect";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseCatalogParams(sp: SP) {
  const s = {
    q: one(sp.q)?.slice(0, 80),
    category: one(sp.category),
    distribution: one(sp.distribution),
    modified: one(sp.modified),
    installable: one(sp.installable),
    sort: one(sp.sort),
    page: one(sp.page),
  };
  const query: CatalogQuery = {
    q: s.q || undefined,
    category: s.category || undefined,
    distribution: s.distribution && s.distribution in DISTRIBUTION_LABEL ? s.distribution : undefined,
    modified: s.modified === "true" ? true : s.modified === "false" ? false : undefined,
    installable: s.installable === "true" || undefined,
    sort: (["popular", "new", "updated", "name"] as const).find((x) => x === s.sort),
    page: Number.parseInt(s.page ?? "1", 10) || 1,
  };
  return { raw: s, query };
}

/** Shared catalog listing with category chips, filters and pagination. */
export async function CatalogPage({ title, kind, path, sp, showSearch }: { title: string; kind?: "GAME" | "APP"; path: string; sp: SP; showSearch?: boolean }) {
  const { raw, query } = parseCatalogParams(sp);
  const [data, cats] = await Promise.all([listApps({ ...query, kind }), listCategories(kind)]);
  const base = { q: raw.q, category: raw.category, distribution: raw.distribution, modified: raw.modified, installable: raw.installable, sort: raw.sort };

  return (
    <main className="page">
      <h1 className="large-title">{title}</h1>

      {showSearch && (
        <form action={path} method="get" className="search-field" role="search" style={{ margin: "8px 0 12px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-3)" }} aria-hidden>
            <path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5.2 12.2L21 21" />
          </svg>
          <input name="q" type="search" defaultValue={raw.q} placeholder="Игры, приложения, разработчики" enterKeyHint="search" autoComplete="off" aria-label="Поиск" />
          {raw.category && <input type="hidden" name="category" value={raw.category} />}
        </form>
      )}

      <div className="chips" style={{ marginTop: 8 }}>
        <Link href={`${path.startsWith("/category/") ? (kind === "GAME" ? "/games" : "/apps") : path}${buildQuery(base, { category: undefined, page: undefined })}`} className={`chip${!raw.category ? " active" : ""}`}>Все</Link>
        {cats.map((c) => (
          <Link key={c.id} href={path.startsWith("/category/") ? `/category/${c.slug}` : `${path}${buildQuery(base, { category: c.slug, page: undefined })}`} className={`chip${raw.category === c.slug ? " active" : ""}`}>
            <span>{c.icon}</span> {c.name}
          </Link>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 8, margin: "8px 0 14px" }}>
        <FilterSelect
          name="sort"
          value={raw.sort ?? "popular"}
          options={[["popular", "Популярные"], ["new", "Новые"], ["updated", "Обновлённые"], ["name", "По названию"]]}
        />
        <FilterSelect
          name="distribution"
          value={raw.distribution ?? ""}
          options={[["", "Любой способ"], ...Object.entries(DISTRIBUTION_LABEL)]}
        />
        <FilterSelect name="modified" value={raw.modified ?? ""} options={[["", "Все сборки"], ["false", "Оригинальные"], ["true", "Модифицированные"]]} />
        <FilterSelect name="installable" value={raw.installable ?? ""} options={[["", "Любой статус"], ["true", "Доступно сейчас"]]} />
      </div>

      <p className="footnote" style={{ margin: "0 4px 8px" }}>Найдено: {data.total}</p>
      <AppList apps={data.items} />
      <Pagination page={data.page} pages={data.pages} makeHref={(p) => `${path}${buildQuery(base, { page: String(p) })}`} />
    </main>
  );
}
