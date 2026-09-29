import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { email: true } } } });
  return (
    <div className="glass card" style={{ overflowX: "auto" }}>
      <table className="table">
        <thead><tr><th>Время (UTC)</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="caption" style={{ whiteSpace: "nowrap" }}>{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
              <td className="footnote">{l.actor?.email ?? "система"}</td>
              <td className="mono">{l.action}</td>
              <td className="mono">{l.entityType}{l.entityId ? `:${l.entityId.slice(0, 10)}` : ""}</td>
              <td className="mono">{JSON.stringify(l.meta).slice(0, 160)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p className="footnote">Записей нет.</p>}
    </div>
  );
}
