import { notFound } from "next/navigation";
import { CatalogPage } from "@/components/CatalogPage";
import { listCategories } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const cat = (await listCategories()).find((c) => c.slug === slug);
  if (!cat) notFound();
  return <CatalogPage title={`${cat.icon} ${cat.name}`} kind={cat.kind} path={`/category/${slug}`} sp={{ ...(await searchParams), category: slug }} />;
}
