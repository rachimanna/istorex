"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";
import { AppIcon } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Черновик", PUBLISHED: "Опубликовано", HIDDEN: "Скрыто", TAKEN_DOWN: "Снято по жалобе" };

export function StatusControls({ id, status, name }: { id: string; status: string; name: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const setStatus = async (s: string) => {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/admin/apps/${id}`, { method: "PATCH", json: { status: s } });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="glass card stack">
      <div className="spread">
        <span className="footnote">Статус: <strong>{STATUS_LABEL[status]}</strong></span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {status !== "PUBLISHED" && <button className="btn btn-primary" disabled={busy} onClick={() => setStatus("PUBLISHED")}>Опубликовать</button>}
        {status === "PUBLISHED" && <button className="btn" disabled={busy} onClick={() => setStatus("HIDDEN")}>Скрыть</button>}
        {status !== "DRAFT" && <button className="btn" disabled={busy} onClick={() => setStatus("DRAFT")}>В черновики</button>}
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Удалить «${name}» вместе со всеми файлами? Это необратимо.`)) return;
            setBusy(true);
            try {
              await apiFetch(`/api/admin/apps/${id}`, { method: "DELETE" });
              router.push("/admin/apps");
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Удалить
        </button>
      </div>
      {err && <p className="error-text" role="alert">{err}</p>}
    </div>
  );
}

async function uploadFiles(url: string, files: FileList) {
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("file", f);
  return apiFetch(url, { method: "POST", body: fd });
}

export function MediaManager({ appId, name, iconUrl, screenshots }: { appId: string; name: string; iconUrl: string | null; screenshots: { id: string; url: string; w: number; h: number }[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const iconRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<HTMLInputElement>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="glass card stack">
      <div className="row">
        <AppIcon url={iconUrl} name={name} size={72} />
        <div className="stack" style={{ gap: 6 }}>
          <span className="footnote">PNG/JPEG/WebP, квадрат, от 180×180 (лучше 1024×1024)</span>
          <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.length && run(() => uploadFiles(`/api/admin/apps/${appId}/icon`, e.target.files!))} />
          <button className="btn" disabled={busy} onClick={() => iconRef.current?.click()} style={{ alignSelf: "flex-start" }}>Загрузить иконку</button>
        </div>
      </div>
      <hr className="divider" />
      <div className="hscroll shots" style={{ gridAutoColumns: "140px" }}>
        {screenshots.map((s) => (
          <div key={s.id} className="stack" style={{ gap: 4 }}>
            <img src={s.url} alt="" width={s.w} height={s.h} style={{ borderRadius: 12 }} />
            <button className="btn btn-danger" disabled={busy} onClick={() => run(() => apiFetch(`/api/admin/screenshots/${s.id}`, { method: "DELETE" }))}>Удалить</button>
          </div>
        ))}
      </div>
      <input ref={shotsRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files?.length && run(() => uploadFiles(`/api/admin/apps/${appId}/screenshots`, e.target.files!))} />
      <button className="btn" disabled={busy} onClick={() => shotsRef.current?.click()} style={{ alignSelf: "flex-start" }}>+ Скриншоты (до 10)</button>
      {busy && <span className="footnote">Загрузка…</span>}
      {err && <p className="error-text" role="alert">{err}</p>}
    </div>
  );
}
