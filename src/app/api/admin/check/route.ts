import { requireAdmin } from "@/lib/auth";
import { runAvailabilityCheck } from "@/lib/availability";
import { api, json } from "@/lib/http";
import { audit } from "@/lib/log";
import { clientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

export const POST = api(async (req: Request) => {
  const admin = await requireAdmin();
  const result = await runAvailabilityCheck();
  await audit(admin.id, "availability.check", "system", null, { checked: result.checked, failed: result.failed }, clientIp(req));
  return json(result);
});
