import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

let s3: S3Client | null = null;

function getS3(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || 'https://edad30fa0fe66f50971087c6b0df0f28.r2.cloudflarestorage.com',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return s3;
}

export async function uploadToR2(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<{ key: string; url: string }> {
  const bucket     = process.env.R2_BUCKET      || 'genshape3d';
  const publicUrl  = process.env.R2_PUBLIC_URL  || `${process.env.R2_ENDPOINT}/${bucket}`;
  const ext        = path.extname(originalName) || '.jpg';
  const key        = `uploads/${Date.now()}-${randomUUID()}${ext}`;

  await getS3().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));

  return { key, url: `${publicUrl}/${key}` };
}

// Presigned GET — lets browsers fetch objects DIRECTLY from R2/Cloudflare
// edge instead of streaming every byte through this server's tunnel
// (~100KB/s under load). 1h expiry; callers re-list to refresh.
export async function presignR2Get(key: string, expiresIn = 3600): Promise<string> {
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const bucket = process.env.R2_BUCKET || 'genshape3d';
  // Cast: presigner's bundled smithy types lag the s3 client's — same wire shape.
  return getSignedUrl(getS3() as any, new GetObjectCommand({ Bucket: bucket, Key: key }) as any, { expiresIn });
}

export async function getR2Stream(key: string) {
  const bucket = process.env.R2_BUCKET || 'genshape3d';
  const result = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return result;
}
