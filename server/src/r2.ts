import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
