// For every recovered job (prompt = '(recovered)' and imageUrl = ''), find
// the most recent uploads/ image before completedAt and set it as the input
// preview. Heuristic but usually correct: each user upload comes ~5-30 min
// before the corresponding GLB output.
//
// Usage: npx ts-node scripts/r2-link-uploads.ts

import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

const BUCKET = process.env.R2_BUCKET || 'genshape3d';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${BUCKET}`;

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
});

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const main = async () => {
  // Pull all uploads/, sorted by lastModified asc.
  const uploads: { key: string; ts: number }[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: 'uploads/', ContinuationToken: token, MaxKeys: 1000,
    }));
    for (const obj of r.Contents || []) {
      uploads.push({ key: obj.Key || '', ts: obj.LastModified?.getTime() || 0 });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  uploads.sort((a, b) => a.ts - b.ts);

  // Recovered jobs that need a preview
  const { rows } = await db.query(`
    SELECT id, "completedAt", "imageUrl"
    FROM genshape3d_jobs
    WHERE prompt = '(recovered)' AND ("imageUrl" = '' OR "imageUrl" IS NULL)
  `);

  console.log(`${rows.length} recovered jobs need preview linking, ${uploads.length} uploads available\n`);

  // Track keys we've already used so multiple recovered jobs from the same
  // session don't all link to the same upload.
  const used = new Set<string>();

  for (const r of rows) {
    const completedTs = new Date(r.completedAt).getTime();
    // Pick the latest upload that's BEFORE completedAt and not yet used.
    let best: { key: string; ts: number } | null = null;
    for (const u of uploads) {
      if (u.ts > completedTs) break;
      if (used.has(u.key)) continue;
      best = u;
    }

    if (!best) {
      console.log(`  - ${r.id.slice(0, 8)}  no matching upload (job at ${r.completedAt.slice(0, 19)})`);
      continue;
    }
    used.add(best.key);

    const url = `${PUBLIC_URL}/${best.key}`;
    await db.query(`UPDATE genshape3d_jobs SET "imageUrl" = $1 WHERE id = $2`, [url, r.id]);
    console.log(`  ✓ ${r.id.slice(0, 8)}  →  ${best.key}`);
  }

  console.log('\nReload your dashboard.');
  await db.end();
};

main().catch(e => { console.error(e); process.exit(1); });
