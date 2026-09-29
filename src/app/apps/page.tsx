import { CatalogPage } from "@/components/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Приложения" };

export default async function AppsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CatalogPage title="Приложения" kind="APP" path="/apps" sp={await searchParams} />;
}
