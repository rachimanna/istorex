import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { env } from "./env";

let client: S3Client | null = null;

export function s3(): S3Client {
  if (!client) {
    if (!env.s3.endpoint) throw new Error("S3_ENDPOINT не задан — облачное хранилище не настроено");
    client = new S3Client({
      endpoint: env.s3.endpoint,
      region: env.s3.region,
      forcePathStyle: env.s3.forcePathStyle,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  }
  return client;
}

export type Bucket = "ipa" | "media";
const bucketName = (b: Bucket) => (b === "ipa" ? env.s3.bucketIpa : env.s3.bucketMedia);

/** Streams a body into object storage using multipart upload (safe for multi-GB IPAs). */
export async function putObject(bucket: Bucket, key: string, body: Readable | Buffer, contentType: string, contentLength?: number) {
  const upload = new Upload({
    client: s3(),
    params: {
      Bucket: bucketName(bucket),
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
      CacheControl: bucket === "media" ? "public, max-age=31536000, immutable" : "private, no-store",
    },
    queueSize: 4,
    partSize: 16 * 1024 * 1024,
  });
  await upload.done();
}

export async function deleteObject(bucket: Bucket, key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key }));
}

export async function headObject(bucket: Bucket, key: string) {
  return s3().send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
}

export async function getObject(bucket: Bucket, key: string) {
  return s3().send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
}

/** Short-lived download URL for a private IPA. */
export async function presignIpa(key: string, downloadName?: string) {
  const cmd = new GetObjectCommand({
    Bucket: env.s3.bucketIpa,
    Key: key,
    ResponseContentType: "application/octet-stream",
    ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/[^\w.\-]/g, "_")}"` : undefined,
  });
  return getSignedUrl(s3(), cmd, { expiresIn: env.limits.ipaUrlTtlSeconds });
}

export async function checkBuckets(): Promise<{ ok: boolean; error?: string }> {
  try {
    await s3().send(new HeadBucketCommand({ Bucket: env.s3.bucketIpa }));
    await s3().send(new HeadBucketCommand({ Bucket: env.s3.bucketMedia }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name + ": " + e.message : String(e) };
  }
}

/** Public URL for an icon/screenshot: CDN/public bucket if configured, else proxied via /media. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (env.s3.publicBaseUrl) return `${env.s3.publicBaseUrl}/${key}`;
  return `/media/${key}`;
}
