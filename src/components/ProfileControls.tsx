"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";

export function ThemeSwitch() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);
  const apply = (t: "system" | "light" | "dark") => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return (
    <div className="segmented" role="radiogroup" aria-label="Тема">
      {(["system", "light", "dark"] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? "on" : ""} onClick={() => apply(t)}>
          {t === "system" ? "Авто" : t === "light" ? "Светлая" : "Тёмная"}
        </button>
      ))}
    </div>
  );
}

export function UdidForm({ initial }: { initial: string | null }) {
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const router = useRouter();
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get("udid") ?? "");
        try {
          await apiFetch("/api/me", { method: "PATCH", json: { deviceUdid: v } });
          setMsg({ ok: v ? "UDID сохранён" : "UDID удалён" });
          router.refresh();
        } catch (err) {
          setMsg({ err: (err as Error).message });
        }
      }}
    >
      <div className="field">
        <label htmlFor="udid">UDID iPhone (необязательно)</label>
        <input id="udid" name="udid" className="input mono" defaultValue={initial ?? ""} placeholder="00008110-000A1B2C3D4E5F6A" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        <span className="caption" style={{ paddingLeft: 4 }}>
          Нужен только чтобы заранее проверить, входит ли ваше устройство в список Ad Hoc-сборки. Узнать UDID: подключите iPhone к Mac (Finder) или ПК (iTunes / Apple Devices) и нажмите на серийный номер.
        </span>
      </div>
      {msg.ok && <p className="ok-text">{msg.ok}</p>}
      {msg.err && <p className="error-text">{msg.err}</p>}
      <button className="btn btn-glass" style={{ alignSelf: "flex-start" }}>Сохранить</button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-danger btn-large"
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST" });
        router.replace("/");
        router.refresh();
      }}
    >
      Выйти
    </button>
  );
}
