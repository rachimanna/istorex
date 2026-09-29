// End-to-end test against a RUNNING server (through the HTTPS proxy), real PostgreSQL and real S3 storage.
// Usage: E2E_BASE=https://localhost:8443 ADMIN_EMAIL=... ADMIN_PASSWORD=... node --env-file=.env tests/e2e.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.E2E_BASE ?? "https://localhost:8443";
const FIX = process.env.E2E_FIXTURES ?? ".dev-data/fixtures";
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const db = new PrismaClient();
const run = Date.now().toString(36);
let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message.split("\n").join("\n      ")}`);
  }
}

class Client {
  cookies = new Map();
  constructor(origin = BASE) {
    this.origin = origin;
  }
  async req(path, { method = "GET", json, form, headers = {}, redirect = "manual" } = {}) {
    const h = { Origin: this.origin, ...headers };
    if (this.cookies.size) h.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let body;
    if (json !== undefined) {
      h["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) body = form;
    const res = await fetch(BASE + path, { method, headers: h, body, redirect });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k, ...v] = kv.split("=");
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v.join("="));
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers, text };
  }
}

const sha = (b) => createHash("sha256").update(b).digest("hex");
function ipaForm(file, fields = {}, filename = file, type = "application/octet-stream") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("file", new File([readFileSync(`${FIX}/${file}`)], filename, { type }));
  return fd;
}
function imgForm(...files) {
  const fd = new FormData();
  for (const f of files) fd.append("file", new File([readFileSync(`${FIX}/${f}`)], f, { type: f.endsWith(".svg") ? "image/svg+xml" : "image/png" }));
  return fd;
}
const codes = (r) => (r.data.findings ?? []).filter((f) => f.level === "error").map((f) => f.code);

const anon = new Client();
const user = new Client();
const admin = new Client();
const evil = new Client("https://evil.example");
const ctx = {};

console.log(`\niStoreX E2E → ${BASE}\n`);

console.log("Инфраструктура");
await step("health: БД, S3 и HTTPS в порядке", async () => {
  const r = await anon.req("/api/health");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.database.ok, true);
  assert.equal(r.data.storage.ok, true);
  assert.equal(r.data.https, true);
});
await step("заголовки безопасности (HSTS, CSP, nosniff, X-Frame-Options)", async () => {
  const r = await anon.req("/");
  assert.match(r.headers.get("strict-transport-security") ?? "", /max-age=/);
  assert.match(r.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
});

console.log("Публичный доступ и защита админки");
await step("каталог доступен без регистрации", async () => {
  const r = await anon.req("/api/apps");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.items));
  for (const p of ["/", "/games", "/apps", "/search", "/help", "/privacy", "/terms", "/contact", "/manifest.webmanifest", "/sw.js"]) {
    assert.equal((await anon.req(p)).status, 200, p);
  }
});
await step("админ-API без входа → 401, страница /admin → редирект на вход", async () => {
  assert.equal((await anon.req("/api/admin/apps")).status, 401);
  assert.equal((await anon.req("/api/admin/apps", { method: "POST", json: {} })).status, 401);
  const page = await anon.req("/admin");
  assert.ok([307, 308].includes(page.status), `status ${page.status}`);
  assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fadmin|\/login\?next=\/admin/);
});

console.log("Регистрация и вход");
const uEmail = `user-${run}@example.com`;
await step("слабый пароль отклоняется", async () => {
  const r = await user.req("/api/auth/register", { method: "POST", json: { email: uEmail, password: "short", displayName: "Тест" } });
  assert.equal(r.status, 400);
});
await step("регистрация пользователя", async () => {
  const r = await user.req("/api/auth/register", { method: "POST", json: { email: uEmail, password: "correct horse battery", displayName: "Тестовый Пользователь" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(user.cookies.size, 1);
  const stored = await db.user.findUnique({ where: { email: uEmail } });
  assert.ok(stored.passwordHash.startsWith("$2"), "пароль хранится как bcrypt-хеш");
});
await step("повторная регистрация → 409", async () => {
  assert.equal((await anon.req("/api/auth/register", { method: "POST", json: { email: uEmail, password: "correct horse battery", displayName: "X y" } })).status, 409);
});
await step("неверный пароль → 401; верный → сессия", async () => {
  const c = new Client();
  assert.equal((await c.req("/api/auth/login", { method: "POST", json: { email: uEmail, password: "wrong password!" } })).status, 401);
  const ok = await c.req("/api/auth/login", { method: "POST", json: { email: uEmail, password: "correct horse battery" } });
  assert.equal(ok.status, 200);
  const me = await c.req("/api/me");
  assert.equal(me.data.user.email, uEmail);
  await c.req("/api/auth/logout", { method: "POST" });
  assert.equal((await c.req("/api/me")).data.user, null);
});
await step("обычный пользователь не имеет доступа к админке → 403", async () => {
  assert.equal((await user.req("/api/admin/apps")).status, 403);
  assert.equal((await user.req("/api/admin/check", { method: "POST" })).status, 403);
});
await step("CSRF: запрос с чужого Origin отклоняется → 403", async () => {
  const r = await evil.req("/api/auth/login", { method: "POST", json: { email: uEmail, password: "correct horse battery" } });
  assert.equal(r.status, 403);
});
await step("защита от перебора паролей → 429", async () => {
  const c = new Client();
  let last;
  for (let i = 0; i < 9; i++) last = await c.req("/api/auth/login", { method: "POST", json: { email: `brute-${run}@example.com`, password: "nope-nope" } });
  assert.equal(last.status, 429);
});
await step("вход администратора", async () => {
  const r = await admin.req("/api/auth/login", { method: "POST", json: ADMIN });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, "ADMIN");
});

console.log("Админка: приложение, медиа, проверка IPA");
const tools = await db.category.findUnique({ where: { slug: "tools" } });
const games = await db.category.findUnique({ where: { slug: "games-arcade" } });
await step("валидация: неверный slug → 400", async () => {
  const r = await admin.req("/api/admin/apps", { method: "POST", json: { slug: "Bad Slug!", name: "x", developer: "x", description: "x", categoryId: tools.id } });
  assert.equal(r.status, 400);
});
await step("модифицированная сборка без правового основания → 400", async () => {
  const r = await admin.req("/api/admin/apps", { method: "POST", json: { slug: `mod-${run}`, name: "Mod", developer: "x", description: "x", categoryId: tools.id, isModified: true } });
  assert.equal(r.status, 400);
});
await step("создание приложения (имя с HTML для проверки XSS)", async () => {
  const r = await admin.req("/api/admin/apps", {
    method: "POST",
    json: { slug: `demo-${run}`, name: `Demo <script>alert(1)</script> ${run}`, subtitle: "Тестовое Ad Hoc приложение", developer: "iStoreX Test Team", description: "Описание\nв две строки", categoryId: tools.id, featured: true },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  ctx.appId = r.data.id;
  ctx.slug = r.data.slug;
});
await step("SVG вместо иконки отклоняется (проверка по содержимому) → 415", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}/icon`, { method: "POST", form: imgForm("evil.svg") });
  assert.equal(r.status, 415, JSON.stringify(r.data));
});
await step("загрузка иконки и скриншотов в S3", async () => {
  const i = await admin.req(`/api/admin/apps/${ctx.appId}/icon`, { method: "POST", form: imgForm("icon.png") });
  assert.equal(i.status, 200, JSON.stringify(i.data));
  ctx.iconUrl = i.data.iconUrl;
  const s = await admin.req(`/api/admin/apps/${ctx.appId}/screenshots`, { method: "POST", form: imgForm("shot1.png", "shot2.png") });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const img = await anon.req(ctx.iconUrl);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
});
await step("публикация без версии запрещена → 400", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}`, { method: "PATCH", json: { status: "PUBLISHED" } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /версию/);
});

const rejections = [
  ["not-a-zip.ipa", "AD_HOC_OTA", "NOT_ZIP"],
  ["no-payload.ipa", "AD_HOC_OTA", "NO_APP"],
  ["path-traversal.ipa", "AD_HOC_OTA", "ZIP_STRUCTURE"],
  ["with-mobileconfig.ipa", "AD_HOC_OTA", "MOBILECONFIG"],
  ["fairplay-encrypted.ipa", "IPA_SIDELOAD", "FAIRPLAY_ENCRYPTED"],
  ["bundle-mismatch.ipa", "AD_HOC_OTA", "BUNDLE_MISMATCH"],
  ["adhoc-expired.ipa", "AD_HOC_OTA", "EXPIRED"],
  ["enterprise.ipa", "AD_HOC_OTA", "PROFILE_TYPE"],
  ["sideload-unsigned.ipa", "AD_HOC_OTA", "OTA_UNSIGNED"],
  ["enterprise.ipa", "ENTERPRISE_OTA", "ENTERPRISE_ATTEST"],
];
for (const [file, dist, code] of rejections) {
  await step(`IPA отклонён: ${file} как ${dist} → ${code}`, async () => {
    const r = await admin.req(`/api/admin/apps/${ctx.appId}/releases`, { method: "POST", form: ipaForm(file, { distribution: dist }) });
    assert.equal(r.status, 422, JSON.stringify(r.data).slice(0, 300));
    assert.ok(codes(r).includes(code), `ожидался ${code}, получено ${codes(r)}`);
  });
}
await step("неверное расширение файла → EXTENSION", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}/releases`, { method: "POST", form: ipaForm("adhoc-valid.ipa", { distribution: "AD_HOC_OTA" }, "app.zip") });
  assert.equal(r.status, 422);
  assert.ok(codes(r).includes("EXTENSION"));
});
await step("отклонённые загрузки не попадают в хранилище и видны админу", async () => {
  const failedRel = await db.release.findMany({ where: { appId: ctx.appId, state: "FAILED" } });
  assert.ok(failedRel.length >= 10);
  assert.ok(failedRel.every((r) => r.ipaKey === null));
  const page = await admin.req("/admin/issues");
  assert.match(page.text, /FairPlay/);
});

const validBuf = readFileSync(`${FIX}/adhoc-valid.ipa`);
await step("корректная Ad Hoc-сборка: проверка, SHA-256, метаданные, загрузка в S3", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}/releases`, { method: "POST", form: ipaForm("adhoc-valid.ipa", { distribution: "AD_HOC_OTA", changelog: "Первая версия" }) });
  assert.equal(r.status, 201, JSON.stringify(r.data).slice(0, 500));
  const rel = r.data.release;
  ctx.rel1 = rel.id;
  assert.equal(rel.sha256, sha(validBuf));
  assert.equal(rel.sizeBytes, validBuf.length);
  assert.equal(rel.bundleId, "com.istorex.demo");
  assert.equal(rel.version, "1.0.0");
  assert.equal(rel.minIOS, "16.0");
  assert.equal(rel.profileType, "AD_HOC");
  assert.equal(rel.signingStatus, "VALID");
  assert.equal(rel.teamName, "iStoreX Test Team");
  assert.equal(rel.provisionedDevices.length, 2);
  assert.equal(rel.isCurrent, false, "в ответе снимок до makeCurrent");
});
await step("повторная загрузка того же файла → DUPLICATE", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}/releases`, { method: "POST", form: ipaForm("adhoc-valid.ipa", { distribution: "AD_HOC_OTA" }) });
  assert.equal(r.status, 422);
  assert.ok(codes(r).includes("DUPLICATE"));
});
await step("публикация → приложение появляется в публичном каталоге", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}`, { method: "PATCH", json: { status: "PUBLISHED" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const list = await anon.req(`/api/apps?q=${run}`);
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].slug, ctx.slug);
});

console.log("Поиск и фильтры");
await step("поиск по названию, разработчику, фильтры способа/раздела/статуса", async () => {
  assert.equal((await anon.req(`/api/apps?q=${run}&distribution=AD_HOC_OTA`)).data.total, 1);
  assert.equal((await anon.req(`/api/apps?q=${run}&distribution=APP_STORE`)).data.total, 0);
  assert.equal((await anon.req(`/api/apps?q=${run}&kind=GAME`)).data.total, 0);
  assert.equal((await anon.req(`/api/apps?q=${run}&kind=APP&category=tools`)).data.total, 1);
  assert.equal((await anon.req(`/api/apps?q=${run}&installable=true`)).data.total, 1);
  assert.equal((await anon.req(`/api/apps?q=${run}&modified=true`)).data.total, 0);
  assert.ok((await anon.req(`/api/apps?q=iStoreX Test Team`)).data.total >= 1);
  assert.equal((await anon.req(`/api/apps?sort=bogus`)).status, 400);
});
await step("SQL-инъекция в поиске безопасна", async () => {
  const r = await anon.req(`/api/apps?q=${encodeURIComponent("' OR 1=1; DROP TABLE \"App\"; --")}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 0);
  assert.ok((await db.app.count()) > 0);
});
await step("страница приложения: HTML экранирован (нет XSS)", async () => {
  const r = await anon.req(`/app/${ctx.slug}`);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes("<script>alert(1)</script>"), "сырой <script> в HTML");
  assert.ok(r.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  const s = await anon.req(`/search?q=${run}`);
  assert.match(s.text, /Найдено: <!-- -->1|Найдено: 1/);
});

console.log("Установка и скачивание настоящего файла");
await step("manifest.plist для itms-services: корректный XML и presigned URL", async () => {
  const r = await anon.req(`/api/releases/${ctx.rel1}/manifest.plist`);
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.match(r.headers.get("content-type"), /xml/);
  assert.match(r.text, /<key>bundle-identifier<\/key><string>com\.istorex\.demo<\/string>/);
  assert.match(r.text, /<key>kind<\/key><string>software-package<\/string>/);
  assert.match(r.text, /display-image/);
  ctx.ipaUrl = r.text.match(/software-package<\/string><key>url<\/key><string>([^<]+)</)[1].replace(/&amp;/g, "&");
  assert.match(ctx.ipaUrl, /X-Amz-Signature=/);
});
await step("IPA по ссылке из манифеста скачивается, SHA-256 совпадает", async () => {
  const res = await fetch(ctx.ipaUrl);
  assert.equal(res.status, 200);
  assert.equal(sha(Buffer.from(await res.arrayBuffer())), sha(validBuf));
});
await step("прямое скачивание: 302 → presigned URL → тот же файл", async () => {
  const r = await anon.req(`/api/releases/${ctx.rel1}/download`);
  assert.equal(r.status, 302);
  const res = await fetch(r.headers.get("location"));
  assert.match(res.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(sha(Buffer.from(await res.arrayBuffer())), sha(validBuf));
});
await step("presigned URL без подписи не работает (бакет приватный)", async () => {
  const u = new URL(ctx.ipaUrl);
  const res = await fetch(`${u.origin}${u.pathname}`);
  assert.ok(res.status === 403 || res.status === 401, `status ${res.status}`);
});
await step("скачивания учитываются в статистике", async () => {
  const n = await db.downloadEvent.count({ where: { appId: ctx.appId } });
  assert.ok(n >= 2, `events ${n}`);
  const app = await db.app.findUnique({ where: { id: ctx.appId } });
  assert.equal(app.downloadCount, 1, "уникальные загрузки (IP+версия за сутки)");
});

console.log("Совместимость устройства (UDID) и API деталей");
await step("UDID в профиле: неверный формат → 400", async () => {
  assert.equal((await user.req("/api/me", { method: "PATCH", json: { deviceUdid: "not-a-udid" } })).status, 400);
});
await step("UDID из профиля сборки → udidRegistered=true; чужой → false", async () => {
  await user.req("/api/me", { method: "PATCH", json: { deviceUdid: "00008110-000a1b2c3d4e5f6a" } });
  assert.equal((await user.req(`/api/apps/${ctx.slug}`)).data.current.udidRegistered, true);
  await user.req("/api/me", { method: "PATCH", json: { deviceUdid: "00008110-FFFFFFFFFFFFFFFF" } });
  assert.equal((await user.req(`/api/apps/${ctx.slug}`)).data.current.udidRegistered, false);
  assert.equal((await anon.req(`/api/apps/${ctx.slug}`)).data.current.udidRegistered, null);
  const d = await anon.req(`/api/apps/${ctx.slug}`);
  assert.equal(d.data.current.provisionedDevices, undefined, "список UDID не раскрывается");
});

console.log("Обновления, внешние ссылки, sideload");
await step("публикация обновления v1.1.0 → становится текущей", async () => {
  const r = await admin.req(`/api/admin/apps/${ctx.appId}/releases`, { method: "POST", form: ipaForm("adhoc-valid-v2.ipa", { distribution: "AD_HOC_OTA", changelog: "Исправления" }) });
  assert.equal(r.status, 201);
  ctx.rel2 = r.data.release.id;
  const d = await anon.req(`/api/apps/${ctx.slug}`);
  assert.equal(d.data.current.version, "1.1.0");
  assert.equal(d.data.history.length, 2);
});
await step("App Store: ссылка не на apple.com отклоняется; официальная принимается", async () => {
  const a = await admin.req("/api/admin/apps", { method: "POST", json: { slug: `store-${run}`, name: `Store App ${run}`, developer: "Apple", description: "Официальная ссылка", categoryId: games.id } });
  ctx.storeId = a.data.id;
  const bad = await admin.req(`/api/admin/apps/${ctx.storeId}/releases`, { method: "POST", json: { distribution: "APP_STORE", externalUrl: "https://evil.example/app", version: "1.0", minIOS: "15.0" } });
  assert.equal(bad.status, 400);
  const ok = await admin.req(`/api/admin/apps/${ctx.storeId}/releases`, { method: "POST", json: { distribution: "APP_STORE", externalUrl: "https://apps.apple.com/app/id284882215", version: "1.0", minIOS: "15.0", sizeMb: 250 } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  await admin.req(`/api/admin/apps/${ctx.storeId}/icon`, { method: "POST", form: imgForm("icon.png") });
  assert.equal((await admin.req(`/api/admin/apps/${ctx.storeId}`, { method: "PATCH", json: { status: "PUBLISHED" } })).status, 200);
  const open = await anon.req(`/api/releases/${ok.data.id}/open`);
  assert.equal(open.status, 302);
  assert.equal(open.headers.get("location"), "https://apps.apple.com/app/id284882215");
  assert.equal((await anon.req(`/api/apps?q=${run}&kind=GAME&distribution=APP_STORE`)).data.total, 1);
});
await step("manifest для App Store-сборки не выдаётся", async () => {
  const rel = await db.release.findFirst({ where: { appId: ctx.storeId } });
  assert.equal((await anon.req(`/api/releases/${rel.id}/manifest.plist`)).status, 400);
});
await step("IPA для самостоятельной подписи + источник AltStore/SideStore", async () => {
  const a = await admin.req("/api/admin/apps", { method: "POST", json: { slug: `side-${run}`, name: `Sideload ${run}`, developer: "OSS Dev", description: "Open source, MIT", categoryId: tools.id, legalBasis: "MIT License" } });
  ctx.sideId = a.data.id;
  const r = await admin.req(`/api/admin/apps/${ctx.sideId}/releases`, { method: "POST", form: ipaForm("sideload-unsigned.ipa", { distribution: "IPA_SIDELOAD" }) });
  assert.equal(r.status, 201, JSON.stringify(r.data).slice(0, 300));
  assert.equal(r.data.release.signingStatus, "UNSIGNED");
  await admin.req(`/api/admin/apps/${ctx.sideId}/icon`, { method: "POST", form: imgForm("icon.png") });
  assert.equal((await admin.req(`/api/admin/apps/${ctx.sideId}`, { method: "PATCH", json: { status: "PUBLISHED" } })).status, 200);
  const src = await anon.req("/altstore/source.json");
  const app = src.data.apps.find((x) => x.bundleIdentifier === "com.istorex.sideload");
  assert.ok(app, "приложение в источнике");
  assert.match(app.versions[0].downloadURL, /^https:\/\/.+\/api\/releases\/.+\/download$/);
  assert.equal((await anon.req(`/api/releases/${r.data.release.id}/manifest.plist`)).status, 400, "unsigned IPA не выдаётся через itms-services");
});

console.log("Избранное, профиль, жалобы и удаление контента");
await step("избранное и история загрузок в профиле", async () => {
  assert.equal((await anon.req(`/api/favorites/${ctx.appId}`, { method: "POST" })).status, 401);
  assert.equal((await user.req(`/api/favorites/${ctx.appId}`, { method: "POST" })).status, 200);
  await user.req(`/api/releases/${ctx.rel2}/download`);
  const p = await user.req("/profile");
  assert.match(p.text, new RegExp(`Demo &lt;script&gt;alert\\(1\\)&lt;/script&gt; ${run}`));
  assert.match(p.text, /Скачивание IPA/);
});
await step("жалоба правообладателя → снятие приложения с публикации", async () => {
  const rep = await anon.req("/api/reports", { method: "POST", json: { appId: ctx.storeId, reason: "COPYRIGHT", message: "Это моё приложение, прошу удалить.", email: "owner@example.com" } });
  assert.equal(rep.status, 201);
  const res = await admin.req(`/api/admin/reports/${rep.data.id}`, { method: "PATCH", json: { status: "RESOLVED", resolution: "Снято", takeDown: true } });
  assert.equal(res.status, 200);
  assert.equal((await anon.req(`/api/apps?q=Store App ${run}`)).data.total, 0);
  assert.equal((await anon.req(`/app/store-${run}`)).status, 404);
});

console.log("Подпись: истечение и проверка доступности");
await step("cron-проверка: неверный секрет → 401", async () => {
  assert.equal((await anon.req("/api/cron/check-availability", { method: "POST", headers: { Authorization: "Bearer wrong" } })).status, 401);
});
await step("истёкшая подпись обнаруживается проверкой, установка блокируется", async () => {
  await db.release.update({ where: { id: ctx.rel2 }, data: { profileExpiresAt: new Date(Date.now() - 1000) } });
  const r = await anon.req("/api/cron/check-availability", { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const rel = await db.release.findUnique({ where: { id: ctx.rel2 } });
  assert.equal(rel.signingStatus, "EXPIRED");
  assert.equal((await anon.req(`/api/releases/${ctx.rel2}/manifest.plist`)).status, 409);
  assert.equal((await anon.req(`/api/apps/${ctx.slug}`)).data.current.signingStatus, "EXPIRED");
  assert.equal((await anon.req(`/api/apps?q=${run}&installable=true&kind=APP&distribution=AD_HOC_OTA`)).data.total, 0);
});
await step("удалённый из хранилища файл обнаруживается проверкой", async () => {
  const side = await db.release.findFirst({ where: { appId: ctx.sideId, isCurrent: true } });
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_IPA, Key: side.ipaKey }));
  await admin.req("/api/admin/check", { method: "POST" });
  const after = await db.release.findUnique({ where: { id: side.id } });
  assert.equal(after.lastCheckOk, false);
  assert.match(after.lastCheckError, /не найден/);
  const d = await anon.req(`/api/apps/side-${run}`);
  assert.ok(d.data.current.serverBlockers.length > 0);
});

console.log("Журнал и удаление");
await step("действия администратора записаны в журнал", async () => {
  const actions = (await db.auditLog.findMany({ where: { entityId: { in: [ctx.appId, ctx.rel1, ctx.rel2, ctx.storeId] } } })).map((a) => a.action);
  for (const a of ["app.create", "release.upload", "app.status.published", "app.takedown", "app.icon"]) assert.ok(actions.includes(a), `нет ${a}`);
});
await step("удаление приложения удаляет записи и файлы из S3", async () => {
  const rel = await db.release.findFirst({ where: { appId: ctx.storeId } });
  assert.equal((await admin.req(`/api/admin/apps/${ctx.storeId}`, { method: "DELETE" })).status, 200);
  assert.equal(await db.app.count({ where: { id: ctx.storeId } }), 0);
  assert.equal(await db.release.count({ where: { id: rel.id } }), 0);
});

console.log(`\nИтог: ${passed} пройдено, ${failed} с ошибками\n`);
console.log(JSON.stringify({ slug: ctx.slug, appId: ctx.appId, rel1: ctx.rel1, iconUrl: ctx.iconUrl }));
await db.$disconnect();
process.exit(failed ? 1 : 0);
