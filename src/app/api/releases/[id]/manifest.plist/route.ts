import { deliverableRelease, recordDelivery } from "@/lib/delivery";
import { env } from "@/lib/env";
import { api, ApiError } from "@/lib/http";
import { mediaUrl, presignIpa } from "@/lib/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (u: string | null) => (u ? (u.startsWith("http") ? u : `${env.appUrl}${u}`) : null);

/**
 * itms-services manifest for Over-The-Air installation (Ad Hoc / Enterprise builds only).
 * iOS downloads this plist, then fetches the IPA from the short-lived presigned HTTPS URL inside it.
 */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const r = await deliverableRelease(id);
  if (r.distribution !== "AD_HOC_OTA" && r.distribution !== "ENTERPRISE_OTA") throw new ApiError(400, "Эта сборка не распространяется через itms-services");
  if (!r.ipaKey || !r.bundleId) throw new ApiError(409, "Файл сборки отсутствует");
  if (["EXPIRED", "UNSIGNED", "INVALID"].includes(r.signingStatus)) throw new ApiError(409, "Подпись сборки недействительна — установка невозможна");
  if (r.distribution === "ENTERPRISE_OTA" && !r.enterpriseAttested) throw new ApiError(409, "Enterprise-сборка не подтверждена администратором");
  if (env.isProd && !env.appUrl.startsWith("https://")) throw new ApiError(500, "Сервер настроен без HTTPS — iOS не установит приложение");

  await recordDelivery(req, r, "INSTALL_MANIFEST");
  const ipaUrl = await presignIpa(r.ipaKey);
  const icon = abs(mediaUrl(r.app.iconKey));

  const assets = [`<dict><key>kind</key><string>software-package</string><key>url</key><string>${esc(ipaUrl)}</string></dict>`];
  if (icon) {
    assets.push(`<dict><key>kind</key><string>display-image</string><key>url</key><string>${esc(icon)}</string></dict>`);
    assets.push(`<dict><key>kind</key><string>full-size-image</string><key>url</key><string>${esc(icon)}</string></dict>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>${assets.join("")}</array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${esc(r.bundleId)}</string>
        <key>bundle-version</key><string>${esc(r.version)}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>${esc(r.app.name)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
});
