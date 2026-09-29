import { deliverableRelease, recordDelivery } from "@/lib/delivery";
import { api, ApiError } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Counts a click and redirects to the official source (App Store, TestFlight, developer site, marketplace). */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const r = await deliverableRelease(id);
  if (!r.externalUrl) throw new ApiError(404, "Ссылка не задана");
  await recordDelivery(req, r, "EXTERNAL_LINK");
  return new Response(null, { status: 302, headers: { Location: r.externalUrl, "Cache-Control": "no-store" } });
});
