// Recover orphan R2 GLBs — files that exist on R2 but no DB row references.
// Re-creates a `done` row in genshape3d_jobs for each so the asset rail
// shows them again. Names them "Recovered <date>" so they're easy to spot.
//
// Usage: npx ts-node scripts/r2-recover-orphans.ts [email] [--days N]

import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const BUCKET = process.env.R2_BUCKET || 'genshape3d';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${BUCKET}`;

const email = process.argv[2] || 'usquiano@gmail.com';
const daysIdx = process.argv.indexOf('--days');
const days    = daysIdx >= 0 ? parseInt(process.argv[daysIdx + 1] || '2', 10) : 2;

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
  // List R2 outputs/
  const keys: { key: string; lastModified: Date | undefined; size: number }[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: 'outputs/', ContinuationToken: token, MaxKeys: 1000,
    }));
    for (const obj of r.Contents || []) {
      keys.push({ key: obj.Key || '', lastModified: obj.LastModified, size: obj.Size || 0 });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);

  // DB references
  const { rows } = await db.query(`SELECT "resultUrl" FROM genshape3d_jobs`);
  const referenced = new Set<string>();
  for (const r of rows) {
    if (r.resultUrl) {
      const m = r.resultUrl.match(/\/outputs\/([^?]+)$/);
      if (m) referenced.add('outputs/' + m[1]);
    }
  }

  const cutoffMs = Date.now() - days * 86400_000;
  const orphans = keys.filter(k =>
    !referenced.has(k.key) && (k.lastModified?.getTime() || 0) >= cutoffMs,
  );
  orphans.sort((a, b) => (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0));

  console.log(`Recovering ${orphans.length} orphan GLB${orphans.length === 1 ? '' : 's'} from the last ${days} day${days === 1 ? '' : 's'} for ${email}\n`);

  for (const o of orphans) {
    const id = randomUUID();
    const url = `${PUBLIC_URL}/${o.key}`;
    const created = (o.lastModified || new Date()).toISOString();

    // Heuristic quality from file size:
    //   < 1 MB   → Standard, no texture
    //   1-2.5 MB → Standard + texture, or High no texture
    //   > 2.5 MB → High + texture
    const sizeMB = o.size / (1024 * 1024);
    let inferenceSteps = 5, octree = 256, faces = 30000, doTexture = false;
    if (sizeMB > 2.5) { inferenceSteps = 15; octree = 384; faces = 100000; doTexture = true; }
    else if (sizeMB > 1) { inferenceSteps = 5; octree = 256; faces = 30000; doTexture = true; }

    const name = `Recovered ${created.slice(0, 10)} ${created.slice(11, 16)}`;

    await db.query(
      `INSERT INTO genshape3d_jobs
         (id, "userEmail", "imageUrl", name, prompt, style, status, "resultUrl",
          "createdAt", "updatedAt", "completedAt", "polygonBudget", "textureRes",
          "exportFormat", "detailLevel", "doTexture", "octreeResolution",
          "targetFaceCount", "inferenceSteps", "guidanceScale")
       VALUES ($1,$2,$3,$4,$5,$6,'done',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        id, email, '', name, '(recovered)', 'Realistic', url,
        created, created, created,
        'Medium (50k-200k)', '1K', 'GLB', 'Standard',
        doTexture, octree, faces, inferenceSteps, 5,
      ],
    );

    console.log(`  ✓ ${name}  ${(o.size/1024).toFixed(0)} KB  →  ${id.slice(0, 8)}`);
  }

  console.log(`\nDone. Reload your dashboard.`);
  await db.end();
};

main().catch(e => { console.error(e); process.exit(1); });
