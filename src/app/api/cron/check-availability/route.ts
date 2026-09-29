import { runAvailabilityCheck } from "@/lib/availability";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { api, ApiError, json } from "@/lib/http";
import { safeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Called by cron: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://domain/api/cron/check-availability` */
export const POST = api(
  async (req: Request) => {
    const auth = req.headers.get("authorization") ?? "";
    if (!env.cronSecret || !safeEqual(auth, `Bearer ${env.cronSecret}`)) throw new ApiError(401, "Unauthorized");
    const result = await runAvailabilityCheck();
    const purged = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return json({ ...result, expiredSessionsPurged: purged.count });
  },
  { csrf: false },
);
