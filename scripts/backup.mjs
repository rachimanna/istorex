// PostgreSQL backup → gzip → S3-compatible bucket, with retention.
// Requires pg_dump in PATH (included in the Docker image). Usage: npm run backup
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const bucket = process.env.S3_BUCKET_BACKUP;
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
if (!process.env.DATABASE_URL || !bucket) {
  console.error("DATABASE_URL и S3_BUCKET_BACKUP обязательны");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});

// pg_dump does not understand Prisma's ?schema= parameter.
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.delete("schema");

const key = `db/istorex-${new Date().toISOString().replace(/[:.]/g, "-")}.sql.gz`;
const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", "--format=plain", dbUrl.toString()], { stdio: ["ignore", "pipe", "inherit"] });
const exited = new Promise((res, rej) => dump.on("close", (code) => (code === 0 ? res() : rej(new Error(`pg_dump exit ${code}`)))));
dump.on("error", (e) => {
  console.error("Не удалось запустить pg_dump:", e.message);
  process.exit(1);
});

const upload = new Upload({ client: s3, params: { Bucket: bucket, Key: key, Body: dump.stdout.pipe(createGzip()), ContentType: "application/gzip" } });
await Promise.all([upload.done(), exited]);
console.log(`Резервная копия сохранена: s3://${bucket}/${key}`);

const cutoff = Date.now() - retentionDays * 86400_000;
const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "db/" }));
const old = (list.Contents ?? []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff);
if (old.length) {
  await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key })) } }));
  console.log(`Удалено старых копий: ${old.length}`);
}
