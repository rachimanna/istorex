"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params?.get("next") ?? "/profile";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/profile";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="glass card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await apiFetch(`/api/auth/${mode}`, {
            method: "POST",
            json: { email: f.get("email"), password: f.get("password"), ...(mode === "register" ? { displayName: f.get("displayName") } : {}) },
          });
          router.replace(next);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {mode === "register" && (
        <div className="field">
          <label htmlFor="displayName">Имя</label>
          <input id="displayName" name="displayName" className="input" required minLength={2} maxLength={60} autoComplete="nickname" />
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" inputMode="email" autoCapitalize="none" />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input id="password" name="password" type="password" className="input" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} />
        {mode === "register" && <span className="caption" style={{ paddingLeft: 4 }}>Минимум 10 символов.</span>}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="btn btn-primary btn-large" disabled={busy}>{mode === "login" ? "Войти" : "Создать аккаунт"}</button>
      <p className="footnote" style={{ textAlign: "center", margin: 0 }}>
        {mode === "login" ? <>Нет аккаунта? <Link href={`/register?next=${encodeURIComponent(next)}`}>Регистрация</Link></> : <>Уже есть аккаунт? <Link href={`/login?next=${encodeURIComponent(next)}`}>Войти</Link></>}
      </p>
    </form>
  );
}
