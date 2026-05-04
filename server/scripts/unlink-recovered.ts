// Clear `imageUrl` on all rows tagged with prompt='(recovered)'. Better to
// show no thumbnail than the wrong one. The GLB resultUrl is unaffected.
import 'dotenv/config';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r = await db.query(
    `UPDATE genshape3d_jobs SET "imageUrl" = '' WHERE prompt = '(recovered)'`
  );
  console.log(`Unlinked thumbnail on ${r.rowCount} recovered rows`);
  await db.end();
})();
