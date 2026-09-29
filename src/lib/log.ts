import "server-only";
import { db } from "./db";

/** Structured JSON log to stdout (collected by `docker logs`) + persisted copy for the admin panel. */
export async function logError(source: string, err: unknown, context: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), source, message, stack: err instanceof Error ? err.stack : undefined, ...context }));
  try {
    await db.errorLog.create({ data: { source, message: message.slice(0, 2000), context: JSON.parse(JSON.stringify(context)) } });
  } catch {
    // DB may be the thing that failed; stdout already has the record.
  }
}

export async function audit(actorId: string | null, action: string, entityType: string, entityId: string | null, meta: Record<string, unknown> = {}, ip?: string) {
  console.log(JSON.stringify({ level: "audit", time: new Date().toISOString(), actorId, action, entityType, entityId, ...meta }));
  await db.auditLog.create({ data: { actorId, action, entityType, entityId, meta: JSON.parse(JSON.stringify(meta)), ip } });
}
