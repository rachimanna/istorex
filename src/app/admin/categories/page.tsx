import { db } from "@/lib/db";
import { CategoryManager } from "@/components/admin/CategoryManager";

export const dynamic = "force-dynamic";

export default async function AdminCategories() {
  const cats = await db.category.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], include: { _count: { select: { apps: true } } } });
  return <CategoryManager categories={cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, kind: c.kind, icon: c.icon, sortOrder: c.sortOrder, count: c._count.apps }))} />;
}
