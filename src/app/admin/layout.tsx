import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админ-панель", robots: { index: false } };

const NAV = [
  ["/admin", "Обзор"],
  ["/admin/apps", "Приложения"],
  ["/admin/categories", "Категории"],
  ["/admin/reports", "Жалобы"],
  ["/admin/issues", "Проблемы"],
  ["/admin/audit", "Журнал"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/profile");
  return (
    <main className="page" style={{ maxWidth: 960 }}>
      <div className="spread">
        <h1 className="large-title">Админ-панель</h1>
        <span className="badge blue">{user.email}</span>
      </div>
      <nav className="admin-nav chips">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="chip">{label}</Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
