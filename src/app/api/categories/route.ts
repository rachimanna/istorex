import { listCategories } from "@/lib/catalog";
import { api, json } from "@/lib/http";

export const GET = api(async () => json(await listCategories(), { headers: { "Cache-Control": "public, max-age=60" } }));
