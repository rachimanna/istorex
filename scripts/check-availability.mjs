// Triggers the availability / signing check on the running server (for cron).
// Usage: APP_URL=https://... CRON_SECRET=... npm run check:availability
const url = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/api/cron/check-availability`;
const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
const body = await res.text();
console.log(res.status, body);
process.exit(res.ok ? 0 : 1);
