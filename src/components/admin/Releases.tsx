"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";
import { formatBytes, formatDate } from "@/lib/shared/format";
import { DISTRIBUTION_LABEL, SIGNING_LABEL, type Distribution, type SigningStatus } from "@/lib/shared/install";

type Finding = { level: string; code: string; message: string };

export type AdminRelease = {
  id: string;
  version: string;
  buildNumber: string;
  distribution: string;
  state: string;
  isCurrent: boolean;
  signingStatus: string;
  profileType: string;
  teamName: string | null;
  profileExpiresAt: string | null;
  certExpiresAt: string | null;
  devices: number;
  sizeBytes: number;
  sha256: string | null;
  bundleId: string | null;
  minIOS: string;
  externalUrl: string | null;
  enterpriseAttested: boolean;
  validation: Finding[];
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
  createdAt: string;
};

const HOSTED: Distribution[] = ["AD_HOC_OTA", "ENTERPRISE_OTA", "IPA_SIDELOAD"];
const EXTERNAL: Distribution[] = ["APP_STORE", "TESTFLIGHT", "EU_WEB_DISTRIBUTION", "ALT_MARKETPLACE"];

function Findings({ items }: { items: Finding[] }) {
  if (!items.length) return null;
  return (
    <ul className="footnote" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
      {items.map((f, i) => (
        <li key={i} style={{ color: f.level === "error" ? "var(--red)" : f.level === "warning" ? "var(--orange)" : undefined }}>
          <span className="mono">[{f.code}]</span> {f.message}
        </li>
      ))}
    </ul>
  );
}

export function ReleaseUpload({ appId }: { appId: string }) {
  const [mode, setMode] = useState<"ipa" | "link">("ipa");
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; findings?: Finding[] } | null>(null);
  const [dist, setDist] = useState<Distribution>("AD_HOC_OTA");
  const router = useRouter();

  const uploadIpa = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const file = fd.get("file") as File | null;
    if (!file || !file.size) return setResult({ ok: false, message: "Выберите IPA-файл" });
    // Fields must precede the file so the server can stream the file straight to disk.
    const ordered = new FormData();
    for (const [k, v] of fd.entries()) if (k !== "file") ordered.append(k, v);
    ordered.append("file", file);
    setResult(null);
    setProgress(0);
    setPhase("Загрузка на сервер");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/apps/${appId}/releases`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      if (e.loaded === e.total) setPhase("Проверка IPA, подписи и загрузка в хранилище…");
    };
    xhr.onload = () => {
      setProgress(null);
      setPhase(null);
      let data: { error?: string; findings?: Finding[]; release?: { version: string } } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        setResult({ ok: true, message: `Версия ${data.release?.version} загружена и проверена.`, findings: data.findings });
        form.reset();
      } else setResult({ ok: false, message: data.error ?? `Ошибка ${xhr.status}`, findings: data.findings });
      router.refresh();
    };
    xhr.onerror = () => {
      setProgress(null);
      setPhase(null);
      setResult({ ok: false, message: "Сетевая ошибка при загрузке" });
    };
    xhr.send(ordered);
  };

  return (
    <div className="glass card stack">
      <div className="segmented">
        <button type="button" className={mode === "ipa" ? "on" : ""} onClick={() => setMode("ipa")}>Загрузить IPA</button>
        <button type="button" className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>Официальная ссылка</button>
      </div>

      {mode === "ipa" ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); uploadIpa(e.currentTarget); }}>
          <div className="field">
            <label>Способ распространения</label>
            <select name="distribution" className="select" value={dist} onChange={(e) => setDist(e.target.value as Distribution)}>
              {HOSTED.map((d) => <option key={d} value={d}>{DISTRIBUTION_LABEL[d]}</option>)}
            </select>
          </div>
          {dist === "AD_HOC_OTA" && <p className="footnote" style={{ margin: 0 }}>Сборка должна быть подписана Ad Hoc-профилем. Установится только на UDID из профиля (до 100 устройств на аккаунт Apple Developer).</p>}
          {dist === "IPA_SIDELOAD" && <p className="footnote" style={{ margin: 0 }}>Пользователи подпишут файл сами (AltStore/SideStore/Xcode). Зашифрованные App Store-сборки отклоняются.</p>}
          {dist === "ENTERPRISE_OTA" && (
            <label className="checkbox">
              <input type="checkbox" name="enterpriseAttested" value="true" />
              <span className="footnote">Подтверждаю: сборка подписана In-House сертификатом моей организации и распространяется только среди её сотрудников, как требует Apple Developer Enterprise Program. Публичное распространение приведёт к отзыву сертификата.</span>
            </label>
          )}
          <div className="field">
            <label>IPA-файл</label>
            <input name="file" type="file" accept=".ipa" className="input" required />
          </div>
          <div className="field">
            <label>Минимальная iOS (пусто — взять из Info.plist)</label>
            <input name="minIOS" className="input" placeholder="15.0" pattern="\d+(\.\d+){0,2}" />
          </div>
          <div className="field">
            <label>Что нового</label>
            <textarea name="changelog" className="textarea" rows={3} maxLength={4000} />
          </div>
          <label className="checkbox"><input type="checkbox" name="makeCurrent" value="false" /> <span className="footnote">Не делать текущей версией (загрузить как черновик)</span></label>
          {progress !== null && (
            <div className="stack" style={{ gap: 4 }}>
              <div className="progress"><div style={{ width: `${progress}%` }} /></div>
              <span className="caption">{phase} {progress < 100 ? `${progress}%` : ""}</span>
            </div>
          )}
          <button className="btn btn-primary btn-large" disabled={progress !== null}>Загрузить и проверить</button>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setResult(null);
            try {
              await apiFetch(`/api/admin/apps/${appId}/releases`, {
                method: "POST",
                json: {
                  distribution: f.get("distribution"),
                  externalUrl: f.get("externalUrl"),
                  version: f.get("version"),
                  minIOS: f.get("minIOS"),
                  sizeMb: Number(f.get("sizeMb") || 0),
                  changelog: f.get("changelog"),
                },
              });
              setResult({ ok: true, message: "Версия добавлена" });
              router.refresh();
            } catch (err) {
              setResult({ ok: false, message: (err as Error).message });
            }
          }}
        >
          <div className="field">
            <label>Источник</label>
            <select name="distribution" className="select">
              {EXTERNAL.map((d) => <option key={d} value={d}>{DISTRIBUTION_LABEL[d]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Ссылка (https)</label>
            <input name="externalUrl" type="url" className="input" required placeholder="https://apps.apple.com/app/id..." />
          </div>
          <div className="row wrap">
            <div className="field grow"><label>Версия</label><input name="version" className="input" required /></div>
            <div className="field grow"><label>Мин. iOS</label><input name="minIOS" className="input" required defaultValue="15.0" pattern="\d+(\.\d+){0,2}" /></div>
            <div className="field grow"><label>Размер, МБ</label><input name="sizeMb" type="number" min="0" step="0.1" className="input" /></div>
          </div>
          <div className="field"><label>Что нового</label><textarea name="changelog" className="textarea" rows={3} /></div>
          <button className="btn btn-primary btn-large">Добавить версию</button>
        </form>
      )}

      {result && (
        <div className={`notice ${result.ok ? "ok" : "err"}`}>
          <strong>{result.message}</strong>
          <Findings items={result.findings ?? []} />
        </div>
      )}
    </div>
  );
}

export function ReleaseList({ releases }: { releases: AdminRelease[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (!releases.length) return <p className="footnote">Версий пока нет.</p>;
  return (
    <div className="stack">
      {err && <p className="error-text">{err}</p>}
      {releases.map((r) => (
        <div key={r.id} className="glass card stack" style={{ gap: 6 }}>
          <div className="spread">
            <span className="headline">v{r.version}{r.buildNumber ? ` (${r.buildNumber})` : ""}</span>
            <div className="row" style={{ gap: 6 }}>
              {r.isCurrent && <span className="badge green">Текущая</span>}
              <span className={`badge ${r.state === "READY" ? "blue" : r.state === "FAILED" ? "red" : "orange"}`}>{r.state === "READY" ? "Проверена" : r.state === "FAILED" ? "Отклонена" : "Обработка"}</span>
            </div>
          </div>
          <div className="footnote">
            {DISTRIBUTION_LABEL[r.distribution as Distribution]} · {formatBytes(r.sizeBytes)} · iOS {r.minIOS}+ · {formatDate(r.createdAt)}
          </div>
          <div className="footnote">
            Подпись: <strong>{SIGNING_LABEL[r.signingStatus as SigningStatus]}</strong>
            {r.profileType !== "NONE" && ` · профиль ${r.profileType}`}
            {r.teamName && ` · ${r.teamName}`}
            {r.profileExpiresAt && ` · профиль до ${formatDate(r.profileExpiresAt)}`}
            {r.certExpiresAt && ` · сертификат до ${formatDate(r.certExpiresAt)}`}
            {r.profileType === "AD_HOC" || r.profileType === "DEVELOPMENT" ? ` · устройств: ${r.devices}` : ""}
          </div>
          {r.bundleId && <div className="caption mono">{r.bundleId}</div>}
          {r.sha256 && <div className="caption mono">SHA-256: {r.sha256}</div>}
          {r.externalUrl && <a className="caption mono" href={r.externalUrl} target="_blank" rel="noopener">{r.externalUrl}</a>}
          {r.lastCheckOk === false && <div className="notice err">Проверка доступности: {r.lastCheckError}</div>}
          <Findings items={r.validation} />
          <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
            {!r.isCurrent && r.state === "READY" && <button className="btn btn-primary" onClick={() => act(() => apiFetch(`/api/admin/releases/${r.id}`, { method: "PATCH", json: { makeCurrent: true } }))}>Сделать текущей (опубликовать обновление)</button>}
            <button className="btn btn-danger" onClick={() => confirm(`Удалить версию ${r.version}?`) && act(() => apiFetch(`/api/admin/releases/${r.id}`, { method: "DELETE" }))}>Удалить</button>
          </div>
        </div>
      ))}
    </div>
  );
}
