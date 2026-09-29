"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";

type Cat = { id: string; slug: string; name: string; kind: "GAME" | "APP"; icon: string; sortOrder: number; count: number };

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <form
        className="glass card stack"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          run(async () => {
            await apiFetch("/api/admin/categories", {
              method: "POST",
              json: { name: f.get("name"), slug: f.get("slug"), kind: f.get("kind"), icon: f.get("icon") || "📦", sortOrder: Number(f.get("sortOrder") || 0) },
            });
            form.reset();
          });
        }}
      >
        <h2 className="title-2">Новая категория</h2>
        <div className="row wrap">
          <div className="field" style={{ width: 70 }}><label>Иконка</label><input name="icon" className="input" defaultValue="📦" maxLength={8} /></div>
          <div className="field grow"><label>Название</label><input name="name" className="input" required maxLength={40} /></div>
          <div className="field grow"><label>Slug</label><input name="slug" className="input mono" required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></div>
        </div>
        <div className="row wrap">
          <div className="field grow">
            <label>Раздел</label>
            <select name="kind" className="select"><option value="APP">Приложения</option><option value="GAME">Игры</option></select>
          </div>
          <div className="field" style={{ width: 110 }}><label>Порядок</label><input name="sortOrder" type="number" min={0} className="input" defaultValue={0} /></div>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Добавить</button>
      </form>
      {err && <p className="error-text" role="alert">{err}</p>}
      <div className="glass card">
        <table className="table">
          <thead><tr><th></th><th>Название</th><th>Раздел</th><th>Приложений</th><th></th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.icon}</td>
                <td>{c.name}<div className="caption mono">{c.slug}</div></td>
                <td>{c.kind === "GAME" ? "Игры" : "Приложения"}</td>
                <td>{c.count}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn"
                    onClick={() => {
                      const name = prompt("Новое название", c.name);
                      if (name && name !== c.name) run(() => apiFetch(`/api/admin/categories/${c.id}`, { method: "PATCH", json: { name } }));
                    }}
                  >
                    ✎
                  </button>{" "}
                  <button className="btn btn-danger" onClick={() => confirm(`Удалить «${c.name}»?`) && run(() => apiFetch(`/api/admin/categories/${c.id}`, { method: "DELETE" }))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
