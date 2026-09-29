"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";

export function CheckButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="row wrap">
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await apiFetch<{ checked: number; failed: number }>("/api/admin/check", { method: "POST" });
            setMsg(`Проверено: ${r.checked}, с ошибками: ${r.failed}`);
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Проверяю…" : "Проверить сейчас"}
      </button>
      {msg && <span className="footnote">{msg}</span>}
    </div>
  );
}

export function ReportActions({ id, appName }: { id: string; appName: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const act = async (status: "RESOLVED" | "REJECTED", takeDown: boolean) => {
    if (takeDown && !confirm(`Снять «${appName}» с публикации?`)) return;
    const resolution = prompt("Комментарий к решению (необязательно)") ?? "";
    setBusy(true);
    try {
      await apiFetch(`/api/admin/reports/${id}`, { method: "PATCH", json: { status, resolution, takeDown } });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <button className="btn btn-danger" disabled={busy} onClick={() => act("RESOLVED", true)}>Снять приложение</button>
      <button className="btn" disabled={busy} onClick={() => act("RESOLVED", false)}>Решено</button>
      <button className="btn" disabled={busy} onClick={() => act("REJECTED", false)}>Отклонить</button>
      {err && <span className="error-text">{err}</span>}
    </div>
  );
}
