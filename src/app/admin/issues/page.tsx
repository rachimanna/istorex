import Link from "next/link";
import { db } from "@/lib/db";
import { appUrlIsHttps, assertProductionConfig, env } from "@/lib/env";
import { formatDate } from "@/lib/shared/format";
import { SIGNING_LABEL, type SigningStatus } from "@/lib/shared/install";
import { CheckButton } from "@/components/admin/AdminActions";

export const dynamic = "force-dynamic";

export default async function AdminIssues() {
  const [failed, broken, signing, errors] = await Promise.all([
    db.release.findMany({ where: { state: "FAILED" }, orderBy: { createdAt: "desc" }, take: 50, include: { app: { select: { id: true, name: true } } } }),
    db.release.findMany({ where: { isCurrent: true, lastCheckOk: false }, include: { app: { select: { id: true, name: true } } } }),
    db.release.findMany({ where: { isCurrent: true, signingStatus: { in: ["EXPIRED", "EXPIRING_SOON", "INVALID", "UNSIGNED"] }, distribution: { in: ["AD_HOC_OTA", "ENTERPRISE_OTA"] } }, include: { app: { select: { id: true, name: true } } } }),
    db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const config = assertProductionConfig();

  return (
    <div className="stack">
      <div className="glass card stack">
        <h2 className="title-2">Конфигурация сервера</h2>
        {config.length === 0 ? <div className="notice ok">Критичных проблем конфигурации нет. APP_URL: {env.appUrl}</div> : <div className="notice err"><ul style={{ margin: 0 }}>{config.map((c) => <li key={c}>{c}</li>)}</ul></div>}
        {!appUrlIsHttps && <div className="notice warn">APP_URL не https — установка через itms-services на iPhone работать не будет.</div>}
        <CheckButton />
      </div>

      <div className="glass card">
        <h2 className="title-2">Недоступные файлы и ссылки ({broken.length})</h2>
        {broken.map((r) => <p key={r.id} className="footnote"><Link href={`/admin/apps/${r.app.id}`}>{r.app.name}</Link> v{r.version}: {r.lastCheckError} ({formatDate(r.lastCheckAt)})</p>)}
      </div>

      <div className="glass card">
        <h2 className="title-2">Проблемы подписи ({signing.length})</h2>
        {signing.map((r) => (
          <p key={r.id} className="footnote">
            <Link href={`/admin/apps/${r.app.id}`}>{r.app.name}</Link> v{r.version}: {SIGNING_LABEL[r.signingStatus as SigningStatus]}
            {r.profileExpiresAt && `, профиль до ${formatDate(r.profileExpiresAt)}`}
          </p>
        ))}
      </div>

      <div className="glass card">
        <h2 className="title-2">Отклонённые загрузки IPA ({failed.length})</h2>
        {failed.map((r) => {
          const errs = (r.validation as { level: string; message: string }[]).filter((f) => f.level === "error");
          return (
            <div key={r.id} style={{ padding: "8px 0", borderTop: "0.5px solid var(--stroke-soft)" }}>
              <Link href={`/admin/apps/${r.app.id}`} className="headline">{r.app.name}</Link> <span className="footnote">{formatDate(r.createdAt)}</span>
              <ul className="footnote" style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--red)" }}>{errs.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          );
        })}
      </div>

      <div className="glass card">
        <h2 className="title-2">Журнал ошибок сервера</h2>
        <table className="table">
          <tbody>
            {errors.map((e) => (
              <tr key={e.id}>
                <td className="caption" style={{ whiteSpace: "nowrap" }}>{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="mono">{e.source}</td>
                <td className="footnote">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {errors.length === 0 && <p className="footnote">Ошибок нет.</p>}
      </div>
    </div>
  );
}
