// One-shot: list every .glb in R2 and cross-reference against the
// genshape3d_jobs table. Anything in R2 that no DB row references is an
// orphan — usually a job that finished after we deleted its DB row.
//
// Usage: npx ts-node scripts/r2-list-orphans.ts

import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

const BUCKET = process.env.R2_BUCKET || 'genshape3d';

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
  // Pull all R2 keys under outputs/
  const keys: { key: string; lastModified: Date | undefined; size: number }[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: 'outputs/', ContinuationToken: token, MaxKeys: 1000,
    }));
    for (const obj of r.Contents || []) {
      keys.push({
        key: obj.Key || '',
        lastModified: obj.LastModified,
        size: obj.Size || 0,
      });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);

  console.log(`R2 outputs/: ${keys.length} files`);

  // All resultUrls in DB (whether status is done or not)
  const { rows } = await db.query(`SELECT id, status, "resultUrl" FROM genshape3d_jobs`);
  const referencedKeys = new Set<string>();
  for (const r of rows) {
    if (r.resultUrl) {
      // resultUrl is a full https://…/genshape3d/outputs/xxx.glb — last part is the key suffix
      const m = r.resultUrl.match(/\/outputs\/([^?]+)$/);
      if (m) referencedKeys.add('outputs/' + m[1]);
    }
  }
  console.log(`DB jobs: ${rows.length}, with resultUrl pointing into outputs: ${referencedKeys.size}`);

  const orphans = keys.filter(k => !referencedKeys.has(k.key));
  console.log(`\nOrphan GLBs (in R2, not referenced by any DB row): ${orphans.length}`);
  orphans.sort((a, b) => (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0));
  for (const o of orphans) {
    console.log(`  ${o.lastModified?.toISOString()}  ${(o.size/1024).toFixed(0).padStart(5)} KB  ${o.key}`);
  }

  await db.end();
};

main().catch(e => { console.error(e); process.exit(1); });
