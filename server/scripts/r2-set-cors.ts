// One-shot: put a CORS policy on the R2 bucket behind assets.genshape3d.com.
//
// The API hands clients direct asset links (R2_PUBLIC_URL) instead of relaying
// every GLB/PNG through the tunnel. Those links are cross-origin for every app
// that uses them (ugen3d.com, genshape3d.com, ugenvid…), so without a bucket
// CORS policy the browser refuses the response and the app reports the generic
// "Failed to fetch". Range requests matter too — three.js asks for byte ranges
// on big GLBs — hence Content-Range / Accept-Ranges in ExposeHeaders.
//
// Usage: npx ts-node scripts/r2-set-cors.ts

import 'dotenv/config';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.R2_BUCKET || 'genshape3d';

const ALLOWED_ORIGINS = [
  'https://genshape3d.com',
  'https://www.genshape3d.com',
  'https://ugen3d.com',
  'https://www.ugen3d.com',
  'https://ugenvid.uskiano.com',
  'https://bsi.uskiano.com',
  'https://mission-control.uskiano.com',
  'http://localhost:3110',
  'http://localhost:3230',
  'http://localhost:3240',
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
});

const main = async () => {
  await s3.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ALLOWED_ORIGINS,
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['Content-Length', 'Content-Type', 'ETag', 'Content-Range', 'Accept-Ranges'],
        MaxAgeSeconds: 86400,
      }],
    },
  }));

  const got = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log(JSON.stringify(got.CORSRules, null, 2));
};

main().catch((e) => { console.error(e); process.exit(1); });
