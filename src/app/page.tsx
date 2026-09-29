import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { homeSections } from "@/lib/catalog";
import { AppIcon, AppShelf, DistributionBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, user] = await Promise.all([homeSections(), getCurrentUser()]);
  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const empty = !data.popular.length;

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="eyebrow">{today}</div>
          <h1 className="large-title">Сегодня</h1>
        </div>
        <Link href="/profile" className="avatar-btn" aria-label="Профиль">
          {user ? user.displayName.slice(0, 1).toUpperCase() : "👤"}
        </Link>
      </header>

      {data.featured.length > 0 && (
        <div className="hscroll" style={{ gridAutoColumns: "min(calc(100vw - 48px), 640px)" }}>
          {data.featured.map((a) => (
            <Link key={a.id} href={`/app/${a.slug}`} className="hero">
              {a.iconUrl && (
                <div className="hero-bg">
                  <img src={a.iconUrl} alt="" />
                </div>
              )}
              <div className="eyebrow">Выбор редакции</div>
              <h2 className="hero-title">{a.name}</h2>
              <div className="hero-glass">
                <AppIcon url={a.iconUrl} name={a.name} size={48} />
                <div className="grow">
                  <div className="headline" style={{ color: "#fff" }}>{a.name}</div>
                  <div className="footnote" style={{ color: "rgba(255,255,255,.8)" }}>{a.subtitle || a.category.name}</div>
                </div>
                <span className="btn" style={{ background: "rgba(255,255,255,.9)" }}>Открыть</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {empty && (
        <div className="glass card section stack" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>📦</div>
          <p className="headline" style={{ margin: 0 }}>Каталог пока пуст</p>
          <p className="footnote" style={{ margin: 0 }}>Администратор ещё не опубликовал ни одного приложения.</p>
        </div>
      )}

      <AppShelf title="Популярное" apps={data.popular} href="/search?sort=popular" ranked />
      <AppShelf title="Новинки" apps={data.fresh} href="/search?sort=new" />
      <AppShelf title="Обновления" apps={data.updated} href="/search?sort=updated" />
      <AppShelf title="Топ игр" apps={data.games} href="/games" ranked />

      {data.categories.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="title-2">Категории</h2>
          </div>
          <div className="cat-grid">
            {data.categories.map((c) => (
              <Link key={c.id} href={`/category/${c.slug}`} className="glass cat-tile">
                <span className="emoji">{c.icon}</span>
                <span className="headline">{c.name}</span>
                <span className="caption">{c.count} шт.</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section glass card stack">
        <div className="headline">Как устроена установка</div>
        <p className="footnote" style={{ margin: 0 }}>
          iStoreX показывает только реальные способы установки: App Store, TestFlight, Ad Hoc / Enterprise-сборки с действующей подписью,
          разрешённые Apple способы в ЕС и IPA для самостоятельной подписи через AltStore/SideStore. У каждого приложения указан способ и статус подписи.
        </p>
        <div className="row wrap" style={{ gap: 6 }}>
          {(["APP_STORE", "TESTFLIGHT", "AD_HOC_OTA", "IPA_SIDELOAD"] as const).map((d) => <DistributionBadge key={d} d={d} />)}
        </div>
        <Link href="/help" className="btn btn-glass" style={{ alignSelf: "flex-start" }}>Подробнее об установке</Link>
      </section>

      <footer className="section footnote" style={{ textAlign: "center" }}>
        <Link href="/privacy">Конфиденциальность</Link> · <Link href="/terms">Условия</Link> · <Link href="/contact">Контакты</Link>
      </footer>
    </main>
  );
}
