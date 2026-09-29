export type DeviceInfo = {
  kind: "iphone" | "ipad" | "mac" | "android" | "other";
  iosVersion: string | null; // best-effort, derived from User-Agent
  browser: "safari" | "chrome" | "firefox" | "edge" | "other";
  inAppBrowser: boolean;
  standalone: boolean;
};

/** Parses a User-Agent string. On the client pass maxTouchPoints to recognise iPadOS "desktop" UA. */
export function parseDevice(ua: string, opts: { maxTouchPoints?: number; standalone?: boolean } = {}): DeviceInfo {
  let kind: DeviceInfo["kind"] = "other";
  if (/iPhone|iPod/.test(ua)) kind = "iphone";
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (opts.maxTouchPoints ?? 0) > 1)) kind = "ipad";
  else if (/Macintosh/.test(ua)) kind = "mac";
  else if (/Android/.test(ua)) kind = "android";

  let browser: DeviceInfo["browser"] = "other";
  if (/CriOS/.test(ua)) browser = "chrome";
  else if (/FxiOS/.test(ua)) browser = "firefox";
  else if (/EdgiOS/.test(ua)) browser = "edge";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "safari";

  const inAppBrowser = (kind === "iphone" || kind === "ipad") && !/Safari\//.test(ua);

  let iosVersion: string | null = null;
  if (kind === "iphone" || kind === "ipad") {
    // Safari 26+ freezes the "OS 18_x" token, but Version/ still follows the iOS release.
    const v = /Version\/(\d+)(?:\.(\d+))?/.exec(ua);
    const os = /OS (\d+)_(\d+)/.exec(ua);
    if (v && browser === "safari") iosVersion = `${v[1]}.${v[2] ?? 0}`;
    else if (os) iosVersion = `${os[1]}.${os[2]}`;
  }
  return { kind, iosVersion, browser, inAppBrowser, standalone: !!opts.standalone };
}

/** Numeric dotted-version compare: -1 / 0 / 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
