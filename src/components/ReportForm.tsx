"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/shared/client";

const REASONS = [
  ["COPYRIGHT", "Нарушение авторских прав"],
  ["MALWARE", "Вредоносное ПО"],
  ["BROKEN", "Не устанавливается / не работает"],
  ["MISLEADING", "Вводит в заблуждение"],
  ["OTHER", "Другое"],
] as const;

export function ReportForm({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ ok?: boolean; error?: string; busy?: boolean }>({});

  if (!open) {
    return (
      <button className="btn btn-glass" style={{ width: "100%" }} onClick={() => setOpen(true)}>
        ⚑ Пожаловаться на приложение
      </button>
    );
  }
  if (state.ok) return <div className="notice ok">Спасибо! Жалоба отправлена и будет рассмотрена администратором.</div>;

  return (
    <form
      className="glass card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setState({ busy: true });
        try {
          await apiFetch("/api/reports", { method: "POST", json: { appId, reason: f.get("reason"), message: f.get("message"), email: f.get("email") } });
          setState({ ok: true });
        } catch (err) {
          setState({ error: (err as Error).message });
        }
      }}
    >
      <h2 className="title-2">Жалоба</h2>
      <div className="field">
        <label htmlFor="reason">Причина</label>
        <select id="reason" name="reason" className="select" required>
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="message">Описание</label>
        <textarea id="message" name="message" className="textarea" required minLength={10} maxLength={3000} placeholder="Опишите проблему. Правообладателям: укажите, какие права нарушены." />
      </div>
      <div className="field">
        <label htmlFor="email">Email для ответа (необязательно)</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" />
      </div>
      {state.error && <p className="error-text">{state.error}</p>}
      <button className="btn btn-primary btn-large" disabled={state.busy}>Отправить</button>
    </form>
  );
}
