import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/shared/format";
import { mediaUrl } from "@/lib/storage";
import { AppIcon } from "@/components/ui";
import { LogoutButton, ThemeSwitch, UdidForm } from "@/components/ProfileControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Профиль" };

const KIND_LABEL = { INSTALL_MANIFEST: "Установка", IPA_DOWNLOAD: "Скачивание IPA", EXTERNAL_LINK: "Переход к источнику" } as const;

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="page">
        <h1 className="large-title">Профиль</h1>
        <div className="glass card stack">
          <p className="subhead" style={{ margin: 0 }}>Войдите, чтобы сохранять избранное, видеть историю загрузок и проверять совместимость Ad Hoc-сборок.</p>
          <Link href="/login" className="btn btn-primary btn-large">Войти</Link>
          <Link href="/register" className="btn btn-glass btn-large">Создать аккаунт</Link>
        </div>
        <Settings />
      </main>
    );
  }

  const [favorites, downloads] = await Promise.all([
    db.favorite.findMany({ where: { userId: user.id, app: { status: "PUBLISHED" } }, include: { app: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.downloadEvent.findMany({ where: { userId: user.id }, include: { app: true, release: { select: { version: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  return (
    <main className="page">
      <h1 className="large-title">Профиль</h1>
      <div className="glass card row">
        <div className="avatar-btn" style={{ width: 56, height: 56, fontSize: 22 }}>{user.displayName.slice(0, 1).toUpperCase()}</div>
        <div className="grow">
          <div className="headline">{user.displayName}</div>
          <div className="footnote">{user.email}</div>
        </div>
        {user.role === "ADMIN" && <Link href="/admin" className="btn btn-primary">Админка</Link>}
      </div>

      <section className="section">
        <h2 className="title-2" style={{ marginBottom: 10 }}>Избранное</h2>
        {favorites.length ? (
          <div className="glass" style={{ padding: "4px 14px" }}>
            {favorites.map((f) => (
              <Link key={f.appId} href={`/app/${f.app.slug}`} className="app-row">
                <AppIcon url={mediaUrl(f.app.iconKey)} name={f.app.name} size={44} />
                <div className="meta"><div className="name">{f.app.name}</div><div className="sub">{f.app.developer}</div></div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="footnote glass card" style={{ margin: 0 }}>Пока пусто. Нажмите ♡ на странице приложения.</p>
        )}
      </section>

      <section className="section">
        <h2 className="title-2" style={{ marginBottom: 10 }}>История загрузок</h2>
        {downloads.length ? (
          <div className="glass" style={{ padding: "4px 14px" }}>
            {downloads.map((d) => (
              <Link key={d.id} href={`/app/${d.app.slug}`} className="app-row">
                <AppIcon url={mediaUrl(d.app.iconKey)} name={d.app.name} size={36} />
                <div className="meta">
                  <div className="name">{d.app.name} {d.release?.version}</div>
                  <div className="sub">{KIND_LABEL[d.kind]} · {formatDate(d.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="footnote glass card" style={{ margin: 0 }}>Здесь появятся приложения, которые вы устанавливали через iStoreX.</p>
        )}
      </section>

      <section className="section glass card">
        <h2 className="title-2" style={{ marginBottom: 10 }}>Устройство</h2>
        <UdidForm initial={user.deviceUdid} />
      </section>

      <Settings />
      <section className="section"><LogoutButton /></section>
    </main>
  );
}

function Settings() {
  return (
    <section className="section glass card stack">
      <h2 className="title-2">Оформление</h2>
      <ThemeSwitch />
      <hr className="divider" />
      <div className="headline">На экран «Домой»</div>
      <p className="footnote" style={{ margin: 0 }}>
        В Safari нажмите «Поделиться» → «На экран Домой». iStoreX откроется как веб-приложение. Это ярлык сайта — он не устанавливает приложения сам по себе.
      </p>
      <hr className="divider" />
      <div className="row wrap footnote" style={{ gap: 14 }}>
        <Link href="/help">Помощь с установкой</Link>
        <Link href="/privacy">Конфиденциальность</Link>
        <Link href="/terms">Условия</Link>
        <Link href="/contact">Контакты</Link>
      </div>
    </section>
  );
}
