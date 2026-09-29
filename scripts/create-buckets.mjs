// Creates the IPA / media / backup buckets if they don't exist (S3-compatible storage).
// Usage: npm run storage:init
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});

for (const name of [process.env.S3_BUCKET_IPA, process.env.S3_BUCKET_MEDIA, process.env.S3_BUCKET_BACKUP].filter(Boolean)) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    console.log(`✓ ${name} уже существует`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`+ ${name} создан`);
  }
}
