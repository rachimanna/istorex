import { getCurrentUser, requireUser } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { api, json, readJson } from "@/lib/http";
import { profileSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export const GET = api(async () => json({ user: await getCurrentUser() }, { headers: { "Cache-Control": "no-store" } }));

export const PATCH = api(async (req: Request) => {
  const me = await requireUser();
  const data = profileSchema.parse(await readJson(req));
  const user = await db.user.update({
    where: { id: me.id },
    data: { displayName: data.displayName, deviceUdid: data.deviceUdid },
    select: { id: true, email: true, displayName: true, deviceUdid: true },
  });
  invalidateCatalog();
  return json({ ok: true, user });
});
