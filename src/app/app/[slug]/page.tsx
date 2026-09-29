import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAppBySlug, hostedDeliveryBlockers, similarApps, toPublicRelease } from "@/lib/catalog";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { DISTRIBUTION_LABEL } from "@/lib/shared/install";
import { formatBytes, formatCount, formatDate } from "@/lib/shared/format";
import { mediaUrl } from "@/lib/storage";
import { AppIcon, AppShelf, DistributionBadge, SigningBadge } from "@/components/ui";
import { InstallButton, InstallPanel } from "@/components/InstallPanel";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ReportForm } from "@/components/ReportForm";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await getAppBySlug((await params).slug);
  return app ? { title: app.name, description: app.subtitle || app.description.slice(0, 150) } : { title: "Не найдено" };
}

export default async function AppPage({ params }: Props) {
  const { slug } = await params;
  const app = await getAppBySlug(slug);
  if (!app) notFound();
  const [user, serverBlockers, similar] = await Promise.all([getCurrentUser(), hostedDeliveryBlockers(), similarApps(app.id, app.categoryId)]);
  const fav = user ? !!(await db.favorite.findUnique({ where: { userId_appId: { userId: user.id, appId: app.id } } })) : false;
  const cur = app.releases.find((r) => r.isCurrent && r.state === "READY") ?? null;
  const release = cur ? toPublicRelease(cur, { userUdid: user?.deviceUdid ?? null, serverBlockers }) : null;
  const history = app.releases.filter((r) => r.state === "READY");
  const iconUrl = mediaUrl(app.iconKey);

  return (
    <main className="page">
      <Link href={app.category.kind === "GAME" ? "/games" : "/apps"} className="subhead" style={{ color: "var(--accent)" }}>‹ {app.category.kind === "GAME" ? "Игры" : "Приложения"}</Link>

      <div className="detail-head">
        <AppIcon url={iconUrl} name={app.name} size={112} />
        <div className="grow stack" style={{ gap: 4 }}>
          <h1>{app.name}</h1>
          <div className="subhead">{app.subtitle || app.developer}</div>
          <div className="row" style={{ marginTop: 8, gap: 10 }}>
            <InstallButton release={release} appUrl={env.appUrl} />
            <FavoriteButton appId={app.id} initial={fav} signedIn={!!user} />
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Загрузки</div><div className="v">{formatCount(app.downloadCount)}</div></div>
        <div className="stat"><div className="k">Возраст</div><div className="v">{app.ageRating}</div></div>
        <div className="stat"><div className="k">Категория</div><div className="v" style={{ fontSize: 15 }}>{app.category.icon} {app.category.name}</div></div>
        <div className="stat"><div className="k">Разработчик</div><div className="v" style={{ fontSize: 15 }}>{app.developer}</div></div>
        <div className="stat"><div className="k">Размер</div><div className="v">{release ? formatBytes(release.sizeBytes) : "—"}</div></div>
      </div>

      <section className="section glass card stack">
        <div className="spread">
          <h2 className="title-2">Установка</h2>
          {release && <DistributionBadge d={release.distribution} />}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {release && <SigningBadge s={release.signingStatus} />}
          {app.isModified && <span className="badge purple">Модифицированная сборка</span>}
          {release?.ready ? <span className="badge green">Файл проверен</span> : <span className="badge red">Нет доступной версии</span>}
        </div>
        <InstallPanel release={release} appUrl={env.appUrl} />
      </section>

      {app.screenshots.length > 0 && (
        <section className="section">
          <h2 className="title-2" style={{ marginBottom: 10 }}>Скриншоты</h2>
          <div className="hscroll shots">
            {app.screenshots.map((s) => (
              <img key={s.id} src={mediaUrl(s.key)!} width={s.width} height={s.height} alt={`Скриншот ${app.name}`} loading="lazy" />
            ))}
          </div>
        </section>
      )}

      <section className="section glass card">
        <h2 className="title-2" style={{ marginBottom: 8 }}>Описание</h2>
        <p className="pre-line" style={{ margin: 0 }}>{app.description}</p>
      </section>

      {app.isModified && (
        <section className="section glass card stack">
          <h2 className="title-2">О модификации</h2>
          {app.originalAppName && <p style={{ margin: 0 }}>Основано на: <strong>{app.originalAppName}</strong></p>}
          <p className="footnote pre-line" style={{ margin: 0 }}>Правовое основание распространения: {app.legalBasis}</p>
          {app.sourceUrl && <a href={app.sourceUrl} rel="noopener nofollow" target="_blank">Источник сборки ↗</a>}
          <p className="caption" style={{ margin: 0 }}>Модифицированные сборки не связаны с правообладателем оригинала. Если вы правообладатель — отправьте жалобу ниже.</p>
        </section>
      )}

      <section className="section glass card">
        <h2 className="title-2" style={{ marginBottom: 6 }}>Информация</h2>
        <dl className="info-list">
          <div><dt>Версия</dt><dd>{release ? `${release.version}${release.buildNumber ? ` (${release.buildNumber})` : ""}` : "—"}</dd></div>
          <div><dt>Размер</dt><dd>{release ? formatBytes(release.sizeBytes) : "—"}</dd></div>
          <div><dt>Совместимость</dt><dd>{release ? `iOS ${release.minIOS} или новее${release.supportsIphone ? ", iPhone" : ""}` : "—"}</dd></div>
          <div><dt>Обновлено</dt><dd>{formatDate(cur?.createdAt ?? app.updatedAt)}</dd></div>
          <div><dt>Способ</dt><dd>{release ? DISTRIBUTION_LABEL[release.distribution] : "—"}</dd></div>
          {release?.teamName && <div><dt>Подписано</dt><dd>{release.teamName}</dd></div>}
          {release?.profileExpiresAt && <div><dt>Подпись до</dt><dd>{formatDate(release.profileExpiresAt)}</dd></div>}
          {cur?.lastCheckAt && <div><dt>Проверено</dt><dd>{formatDate(cur.lastCheckAt)} {cur.lastCheckOk ? "✓" : "✕"}</dd></div>}
          {cur?.bundleId && <div><dt>Bundle ID</dt><dd className="mono">{cur.bundleId}</dd></div>}
        </dl>
      </section>

      {history.length > 0 && (
        <section className="section glass card">
          <h2 className="title-2" style={{ marginBottom: 6 }}>История версий</h2>
          {history.map((r) => (
            <div key={r.id} style={{ padding: "10px 0", borderTop: "0.5px solid var(--stroke-soft)" }}>
              <div className="spread"><span className="headline">{r.version}</span><span className="footnote">{formatDate(r.createdAt)}</span></div>
              {r.changelog && <p className="footnote pre-line" style={{ margin: "4px 0 0" }}>{r.changelog}</p>}
            </div>
          ))}
        </section>
      )}

      <AppShelf title="Похожие" apps={similar} />

      <section className="section">
        <ReportForm appId={app.id} />
      </section>
    </main>
  );
}
