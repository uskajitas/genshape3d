// Smarter pairing: each recovered GLB has a known size. Size → quality →
// estimated run duration. We back out an estimated `startedAt`, then pick
// the upload that's most-recent at or before that timestamp.
//
//   < 1 MB   → Standard, no texture, ~5 min
//   1-2.5MB  → Standard + texture     ~30 min  (median between 14 / 100)
//   > 2.5 MB → High + texture         ~75 min  (median between 45 / 200)
//
// Each upload is only matched once; existing-done jobs reserve theirs first.

import 'dotenv/config';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
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

const estimatedDurationMs = (sizeBytes: number): number => {
  const mb = sizeBytes / (1024 * 1024);
  if (mb < 1)   return 5  * 60_000;
  if (mb < 2.5) return 30 * 60_000;
  return 75 * 60_000;
};

const main = async () => {
  // R2 inventory
  const list = async (prefix: string) => {
    const out: { key: string; ts: number; size: number }[] = [];
    let token: string | undefined;
    do {
      const r = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000,
      }));
      for (const o of r.Contents || []) {
        out.push({
          key: o.Key || '',
          ts: o.LastModified?.getTime() || 0,
          size: o.Size || 0,
        });
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    out.sort((a, b) => a.ts - b.ts);
    return out;
  };

  const uploads = await list('uploads/');

  // Mark uploads already referenced by *non-recovered* jobs as claimed
  const { rows: refs } = await db.query(
    `SELECT "imageUrl" FROM genshape3d_jobs WHERE prompt <> '(recovered)' AND "imageUrl" <> ''`
  );
  const claimed = new Set<string>();
  for (const r of refs) {
    const m = r.imageUrl?.match(/\/uploads\/([^?]+)$/);
    if (m) claimed.add('uploads/' + m[1]);
  }

  // Recovered jobs (with the GLB sizes from R2)
  const { rows } = await db.query(`
    SELECT id, "completedAt", "resultUrl"
    FROM genshape3d_jobs
    WHERE prompt = '(recovered)'
    ORDER BY "completedAt" ASC
  `);

  console.log(`Pairing ${rows.length} recovered jobs against ${uploads.length} uploads (${claimed.size} already claimed)\n`);

  for (const r of rows) {
    // Get the GLB size via HEAD on its R2 key
    const m = r.resultUrl.match(/\/outputs\/([^?]+)$/);
    if (!m) continue;
    let size = 0;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: 'outputs/' + m[1] }));
      size = head.ContentLength || 0;
    } catch {
      /* ignore, fall through with size=0 → minimal duration */
    }
    const dur = estimatedDurationMs(size);
    const completedTs = new Date(r.completedAt).getTime();
    const targetTs = completedTs - dur;

    // Find the upload at or just before targetTs that isn't claimed.
    let best: { key: string; ts: number; size: number } | null = null;
    let bestGap = Infinity;
    for (const u of uploads) {
      if (claimed.has(u.key)) continue;
      // Allow a small window AFTER targetTs too (up to 5 min) — model loading
      // can push the actual upload-to-completion later than estimated.
      const gap = Math.abs(u.ts - targetTs);
      // Prefer uploads that are BEFORE the completion (uploads after = nope)
      if (u.ts > completedTs) continue;
      if (gap < bestGap) { best = u; bestGap = gap; }
    }

    if (!best) {
      console.log(`  - ${r.id.slice(0, 8)}  no match`);
      continue;
    }
    claimed.add(best.key);

    const url = `${PUBLIC_URL}/${best.key}`;
    await db.query(`UPDATE genshape3d_jobs SET "imageUrl" = $1 WHERE id = $2`, [url, r.id]);
    const completedHM = new Date(completedTs).toISOString().slice(11, 16);
    const uploadHM    = new Date(best.ts).toISOString().slice(11, 16);
    const sizeKB      = (size / 1024).toFixed(0).padStart(5);
    console.log(`  ✓ ${r.id.slice(0, 8)}  ${sizeKB} KB  done ${completedHM} ← upload ${uploadHM}`);
  }

  console.log('\nReload your dashboard.');
  await db.end();
};

main().catch(e => { console.error(e); process.exit(1); });
