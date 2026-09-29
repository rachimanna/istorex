"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";

type AppData = {
  id?: string;
  slug: string;
  name: string;
  subtitle: string;
  developer: string;
  description: string;
  categoryId: string;
  featured: boolean;
  isModified: boolean;
  originalAppName: string | null;
  legalBasis: string;
  sourceUrl: string | null;
  ageRating: string;
};

const EMPTY: AppData = { slug: "", name: "", subtitle: "", developer: "", description: "", categoryId: "", featured: false, isModified: false, originalAppName: null, legalBasis: "", sourceUrl: null, ageRating: "4+" };

function slugify(s: string) {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya" };
  return s.toLowerCase().split("").map((c) => map[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function AppForm({ categories, initial }: { categories: { id: string; name: string }[]; initial?: AppData }) {
  const [v, setV] = useState<AppData>(initial ?? { ...EMPTY, categoryId: categories[0]?.id ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const set = <K extends keyof AppData>(k: K, val: AppData[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <form
      className="glass card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setOk(null);
        try {
          const { id, ...body } = v;
          if (id) {
            await apiFetch(`/api/admin/apps/${id}`, { method: "PATCH", json: body });
            setOk("Сохранено");
            router.refresh();
          } else {
            const created = await apiFetch<{ id: string }>("/api/admin/apps", { method: "POST", json: body });
            router.push(`/admin/apps/${created.id}`);
          }
        } catch (e2) {
          setErr((e2 as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label>Название</label>
        <input className="input" required maxLength={80} value={v.name} onChange={(e) => { set("name", e.target.value); if (!initial) set("slug", slugify(e.target.value)); }} />
      </div>
      <div className="field">
        <label>Адрес страницы (slug)</label>
        <input className="input mono" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={v.slug} onChange={(e) => set("slug", e.target.value)} />
      </div>
      <div className="field">
        <label>Подзаголовок</label>
        <input className="input" maxLength={120} value={v.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </div>
      <div className="field">
        <label>Разработчик</label>
        <input className="input" required maxLength={80} value={v.developer} onChange={(e) => set("developer", e.target.value)} />
      </div>
      <div className="row wrap">
        <div className="field grow">
          <label>Категория</label>
          <select className="select" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Возраст</label>
          <select className="select" value={v.ageRating} onChange={(e) => set("ageRating", e.target.value)}>
            {["4+", "9+", "12+", "17+", "18+"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Описание (обычный текст)</label>
        <textarea className="textarea" required maxLength={8000} rows={8} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <label className="checkbox"><input type="checkbox" checked={v.featured} onChange={(e) => set("featured", e.target.checked)} /> Показывать в «Выбор редакции»</label>
      <label className="checkbox"><input type="checkbox" checked={v.isModified} onChange={(e) => set("isModified", e.target.checked)} /> Модифицированная сборка (твик другого приложения)</label>
      {v.isModified && (
        <>
          <div className="field">
            <label>Оригинальное приложение</label>
            <input className="input" maxLength={80} value={v.originalAppName ?? ""} onChange={(e) => set("originalAppName", e.target.value || null)} />
          </div>
          <div className="notice warn">
            Публикуйте только сборки, которые вы вправе распространять: open-source с совместимой лицензией, собственные модификации без чужого закрытого кода, либо с письменного разрешения правообладателя. Опишите основание — оно показывается пользователям.
          </div>
        </>
      )}
      <div className="field">
        <label>Правовое основание / источник {v.isModified ? "(обязательно, ≥ 20 символов)" : "(необязательно)"}</label>
        <textarea className="textarea" rows={3} maxLength={2000} value={v.legalBasis} onChange={(e) => set("legalBasis", e.target.value)} placeholder="Например: MIT License, исходный код https://github.com/..., разрешение автора от 01.09.2026" />
      </div>
      <div className="field">
        <label>Ссылка на источник (https, необязательно)</label>
        <input className="input" type="url" value={v.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value || null)} />
      </div>
      {err && <p className="error-text" role="alert">{err}</p>}
      {ok && <p className="ok-text">{ok}</p>}
      <button className="btn btn-primary btn-large" disabled={busy}>{v.id ? "Сохранить" : "Создать"}</button>
    </form>
  );
}
