import { deliverableRelease, recordDelivery } from "@/lib/delivery";
import { api, ApiError } from "@/lib/http";
import { presignIpa } from "@/lib/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Direct IPA download (for self-signing via AltStore / SideStore / Xcode). Redirects to a short-lived presigned URL. */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const r = await deliverableRelease(id);
  if (!r.ipaKey) throw new ApiError(404, "Для этой сборки нет файла");
  await recordDelivery(req, r, "IPA_DOWNLOAD");
  const url = await presignIpa(r.ipaKey, `${r.app.slug}-${r.version}.ipa`);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
});
