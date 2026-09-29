import { z } from "zod";
import { listApps } from "@/lib/catalog";
import { api, json } from "@/lib/http";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  kind: z.enum(["GAME", "APP"]).optional(),
  category: z.string().max(60).optional(),
  distribution: z.enum(["APP_STORE", "TESTFLIGHT", "AD_HOC_OTA", "ENTERPRISE_OTA", "EU_WEB_DISTRIBUTION", "ALT_MARKETPLACE", "IPA_SIDELOAD"]).optional(),
  modified: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  installable: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  sort: z.enum(["popular", "new", "updated", "name"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});

/** Public, paginated catalog API. */
export const GET = api(async (req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const q = querySchema.parse(params);
  const data = await listApps(q);
  return json(data, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
});
