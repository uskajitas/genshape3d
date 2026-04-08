import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const R2_ENDPOINT   = process.env.R2_ENDPOINT           || 'https://edad30fa0fe66f50971087c6b0df0f28.r2.cloudflarestorage.com';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID      || '';
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY  || '';
const R2_BUCKET     = process.env.R2_BUCKET             || 'genshape3d';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL         || `${R2_ENDPOINT}/${R2_BUCKET}`;

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,           // required for Cloudflare R2
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

export async function uploadToR2(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<{ key: string; url: string }> {
  const ext = path.extname(originalName) || '.jpg';
  const key = `uploads/${Date.now()}-${randomUUID()}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));

  return { key, url: `${R2_PUBLIC_URL}/${key}` };
}
