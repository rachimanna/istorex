import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/shared/format";
import { ReportActions } from "@/components/admin/AdminActions";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = { COPYRIGHT: "Авторские права", MALWARE: "Вредоносное ПО", BROKEN: "Не работает", MISLEADING: "Вводит в заблуждение", OTHER: "Другое" };

export default async function AdminReports() {
  const reports = await db.report.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, include: { app: { select: { id: true, name: true, status: true } } } });
  return (
    <div className="stack">
      {reports.length === 0 && <p className="footnote glass card">Жалоб нет.</p>}
      {reports.map((r) => (
        <div key={r.id} className="glass card stack" style={{ gap: 6 }}>
          <div className="spread">
            <Link href={`/admin/apps/${r.app.id}`} className="headline">{r.app.name}</Link>
            <span className={`badge ${r.status === "OPEN" ? "red" : r.status === "RESOLVED" ? "green" : ""}`}>{r.status === "OPEN" ? "Открыта" : r.status === "RESOLVED" ? "Решена" : "Отклонена"}</span>
          </div>
          <div className="footnote">{REASON[r.reason]} · {formatDate(r.createdAt)}{r.email ? ` · ${r.email}` : ""} · приложение: {r.app.status}</div>
          <p className="pre-line" style={{ margin: 0 }}>{r.message}</p>
          {r.resolution && <p className="footnote" style={{ margin: 0 }}>Решение: {r.resolution}</p>}
          {r.status === "OPEN" && <ReportActions id={r.id} appName={r.app.name} />}
        </div>
      ))}
    </div>
  );
}
