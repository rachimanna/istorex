import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { audit } from "@/lib/log";
import { clientIp } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({
  status: z.enum(["RESOLVED", "REJECTED", "OPEN"]),
  resolution: z.string().trim().max(2000).default(""),
  takeDown: z.boolean().default(false),
});

/** Resolve a complaint; optionally take the app down (removes it from the public catalog immediately). */
export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const data = schema.parse(await readJson(req));
  const report = await db.report.findUnique({ where: { id } });
  if (!report) throw new ApiError(404, "Жалоба не найдена");
  await db.report.update({ where: { id }, data: { status: data.status, resolution: data.resolution, resolvedAt: data.status === "OPEN" ? null : new Date() } });
  if (data.takeDown) {
    await db.app.update({ where: { id: report.appId }, data: { status: "TAKEN_DOWN" } });
    await audit(admin.id, "app.takedown", "app", report.appId, { reportId: id, reason: report.reason }, clientIp(req));
  }
  await audit(admin.id, "report.update", "report", id, { status: data.status }, clientIp(req));
  invalidateCatalog();
  return json({ ok: true });
});
