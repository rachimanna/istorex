import { db } from "@/lib/db";
import { appUrlIsHttps, assertProductionConfig, env } from "@/lib/env";
import { checkBuckets } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Liveness + readiness: database, object storage and critical configuration. */
export async function GET() {
  const started = Date.now();
  let database: { ok: boolean; error?: string; apps?: number } = { ok: false };
  try {
    const apps = await db.app.count();
    database = { ok: true, apps };
  } catch (e) {
    database = { ok: false, error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
  const storage = await checkBuckets();
  const config = assertProductionConfig();
  const ok = database.ok && storage.ok && config.length === 0;
  return Response.json(
    { ok, database, storage, https: appUrlIsHttps, appUrl: env.appUrl, configProblems: config, ms: Date.now() - started, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
