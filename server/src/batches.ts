// ── batches ─────────────────────────────────────────────────────────────────
// One request, and the engine does the rest with nobody watching: for each
// prompt it draws the picture, prepares it, and queues the model. The state
// lives in the database, not in a browser or in this process, so a closed tab
// or a restart loses nothing: the runner reads what is left and carries on.
//
// An item moves  waiting -> drawing -> queued  (or failed). From `queued` on it
// is an ordinary job in genshape3d_jobs, and the worker takes it like any other.
// That is the whole handoff: there is no second queue to keep in step.
//
// Batch jobs carry a lower priority than people's, so a long batch never makes
// someone wait: a job somebody just asked for goes ahead of all of them.

import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { dbQuery } from './db';
import { isAdmin } from './usersRepo';

export const BATCH_PRIORITY = -10;
const TICK_MS = 4000;
const MAX_TRIES = 3;

export interface BatchOptions {
  /** Image providers, tried in order. */
  providers: string[];
  /** Added to every prompt, so a set reads as a set. */
  style: string;
  model: string;
  texture: boolean;
  polycount: number;
  tags: string[];
}

export interface Batch { id: string; email: string; source: string; name: string; options: BatchOptions; }
export interface BatchItem { id: string; batch_id: string; position: number; name: string; prompt: string; tries: number; }

/** The two steps that belong to the engine; passed in, so this file only knows the order of things. */
export interface BatchSteps {
  draw(item: BatchItem, batch: Batch): Promise<{ assetId: string; imageKey: string }>;
  queueModel(item: BatchItem, batch: Batch, imageKey: string): Promise<string>;
}

const DEFAULTS: BatchOptions = {
  providers: ['local-qwen-image'],
  style: '',
  model: 'trellis2',
  texture: true,
  polycount: 100000,
  tags: [],
};

let ready: Promise<unknown> | null = null;
const ensureTables = () => (ready ??= (async () => {
  await dbQuery(`CREATE TABLE IF NOT EXISTS genshape3d_batches (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, source TEXT NOT NULL, name TEXT NOT NULL,
    options JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'running', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS genshape3d_batch_items (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES genshape3d_batches(id), position INT NOT NULL,
    name TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', tries INT NOT NULL DEFAULT 0,
    asset_id TEXT NOT NULL DEFAULT '', image_key TEXT NOT NULL DEFAULT '', job_id TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '')`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS genshape3d_batch_items_next ON genshape3d_batch_items (status, batch_id, position)`);
  // A restart in the middle of a picture: nothing is working on it any more.
  await dbQuery(`UPDATE genshape3d_batch_items SET status = 'waiting' WHERE status = 'drawing'`);
})().catch((e) => { ready = null; throw e; }));

async function nextItem(): Promise<{ item: BatchItem; batch: Batch } | null> {
  const { rows } = await dbQuery(
    `SELECT i.*, b.email, b.source, b.name AS batch_name, b.options FROM genshape3d_batch_items i
       JOIN genshape3d_batches b ON b.id = i.batch_id
      WHERE i.status = 'waiting' AND b.status = 'running'
      ORDER BY b.created_at, i.position LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    item: { id: r.id, batch_id: r.batch_id, position: r.position, name: r.name, prompt: r.prompt, tries: r.tries },
    batch: { id: r.batch_id, email: r.email, source: r.source, name: r.batch_name, options: r.options },
  };
}

async function finishBatches() {
  await dbQuery(
    `UPDATE genshape3d_batches b SET status = 'done' WHERE status = 'running' AND NOT EXISTS (
       SELECT 1 FROM genshape3d_batch_items i WHERE i.batch_id = b.id AND i.status IN ('waiting', 'drawing'))`,
  );
}

async function work(steps: BatchSteps, item: BatchItem, batch: Batch) {
  await dbQuery(`UPDATE genshape3d_batch_items SET status = 'drawing', tries = tries + 1 WHERE id = $1`, [item.id]);
  try {
    // A retry after a picture already exists must not pay for a second one.
    const { rows } = await dbQuery(`SELECT asset_id, image_key FROM genshape3d_batch_items WHERE id = $1`, [item.id]);
    let { asset_id: assetId, image_key: imageKey } = rows[0];
    if (!imageKey) {
      ({ assetId, imageKey } = await steps.draw(item, batch));
      await dbQuery(`UPDATE genshape3d_batch_items SET asset_id = $2, image_key = $3 WHERE id = $1`, [item.id, assetId, imageKey]);
    }
    const jobId = await steps.queueModel(item, batch, imageKey);
    await dbQuery(`UPDATE genshape3d_batch_items SET status = 'queued', job_id = $2, error = '' WHERE id = $1`, [item.id, jobId]);
  } catch (e: any) {
    const gaveUp = item.tries + 1 >= MAX_TRIES;
    console.error(`[batch ${batch.id}] ${item.name}:`, e.message);
    await dbQuery(`UPDATE genshape3d_batch_items SET status = $2, error = $3 WHERE id = $1`,
      [item.id, gaveUp ? 'failed' : 'waiting', String(e.message).slice(0, 500)]);
  }
}

/** One picture at a time: they share a GPU, and a batch is never in a hurry. */
export function startBatchRunner(steps: BatchSteps) {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await ensureTables();
      const next = await nextItem();
      if (next) await work(steps, next.item, next.batch);
      else await finishBatches();
    } catch (e: any) {
      console.error('[batch runner]', e.message);
    } finally {
      busy = false;
    }
  }, TICK_MS);
}

export function mountBatchesApi(app: Express) {
  // { email, source, name, items: [{ name, prompt }], options? }
  app.post('/api/batches', async (req, res) => {
    try {
      const b = req.body || {};
      const email = String(b.email || '');
      if (!email || !(await isAdmin(email))) return res.status(403).json({ error: 'admin only' });
      const items: { name?: string; prompt?: string }[] = Array.isArray(b.items) ? b.items : [];
      if (!items.length || items.length > 200 || items.some((i) => !String(i?.prompt || '').trim())) {
        return res.status(400).json({ error: 'items: 1 to 200, each with a prompt' });
      }
      const source = String(b.source || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(source)) return res.status(400).json({ error: 'source: a workspace key' });
      await ensureTables();
      const id = randomUUID();
      await dbQuery(`INSERT INTO genshape3d_batches (id, email, source, name, options) VALUES ($1, $2, $3, $4, $5)`,
        [id, email, source, String(b.name || source).slice(0, 80), JSON.stringify({ ...DEFAULTS, ...(b.options || {}) })]);
      for (let i = 0; i < items.length; i++) {
        await dbQuery(`INSERT INTO genshape3d_batch_items (id, batch_id, position, name, prompt) VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), id, i, String(items[i].name || `Item ${i + 1}`).slice(0, 80), String(items[i].prompt).trim()]);
      }
      res.status(202).json({ id, items: items.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Where a batch stands, with each model's state read from the job itself.
  app.get('/api/batches/:id', async (req, res) => {
    try {
      await ensureTables();
      const { rows: batches } = await dbQuery(`SELECT id, source, name, status, created_at AS "createdAt" FROM genshape3d_batches WHERE id = $1`, [req.params.id]);
      if (!batches[0]) return res.status(404).json({ error: 'no such batch' });
      const { rows: items } = await dbQuery(
        `SELECT i.name, i.status, i.tries, i.error, i.asset_id AS "assetId", i.job_id AS "jobId", j.status AS "jobStatus", j."progressPct"
           FROM genshape3d_batch_items i LEFT JOIN genshape3d_jobs j ON j.id = i.job_id
          WHERE i.batch_id = $1 ORDER BY i.position`, [req.params.id]);
      res.json({ batch: batches[0], items });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}
