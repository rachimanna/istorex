import Link from "next/link";
import { db } from "@/lib/db";
import { AppForm } from "@/components/admin/AppForm";

export const dynamic = "force-dynamic";

export default async function NewApp() {
  const categories = await db.category.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });
  if (!categories.length) {
    return <div className="notice warn">Сначала создайте хотя бы одну <Link href="/admin/categories">категорию</Link>.</div>;
  }
  return (
    <div className="stack">
      <h2 className="title-2">Новое приложение</h2>
      <p className="footnote" style={{ margin: 0 }}>После создания загрузите иконку, скриншоты и добавьте версию (IPA или ссылку). Затем опубликуйте.</p>
      <AppForm categories={categories.map((c) => ({ id: c.id, name: `${c.icon} ${c.name}` }))} />
    </div>
  );
}
