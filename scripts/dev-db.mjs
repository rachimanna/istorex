// LOCAL DEVELOPMENT ONLY: runs a real PostgreSQL server from npm binaries (no Docker needed).
// Production uses the PostgreSQL container from docker-compose.prod.yml or a managed database.
// Usage: node scripts/dev-db.mjs   (keeps running; Ctrl+C to stop)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.env.DEV_PG_DIR || ".dev-data/pg");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "istorex",
  password: "istorex-dev",
  port: 54329,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync(dir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("istorex");
} catch {
  /* already exists */
}
console.log("PostgreSQL: postgresql://istorex:istorex-dev@localhost:54329/istorex");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
