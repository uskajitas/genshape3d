// ─────────────────────────────────────────────────────────────────────────────
// text2imageRepo — CRUD for text-to-image assets persisted in Postgres.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from './db';
import { randomUUID } from 'node:crypto';

export interface T2IAsset {
  id: string;
  userEmail: string;
  name: string;
  prompt: string;
  finalPrompt: string;
  params: Record<string, any>;
  provider: string;
  imageKey: string;
  seed: number | null;
  createdAt: string;
}

const rowToAsset = (r: any): T2IAsset => ({
  id:          r.id,
  userEmail:   r.user_email,
  name:        r.name,
  prompt:      r.prompt,
  finalPrompt: r.final_prompt,
  params:      r.params || {},
  provider:    r.provider,
  imageKey:    r.image_key,
  seed:        r.seed === null ? null : Number(r.seed),
  createdAt:   r.created_at,
});

export async function createAsset(data: Omit<T2IAsset, 'id' | 'createdAt'>): Promise<T2IAsset> {
  const id = randomUUID();
  const r = await getDb().query(
    `INSERT INTO genshape3d_text2image_assets
       (id, user_email, name, prompt, final_prompt, params, provider, image_key, seed)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
     RETURNING *`,
    [
      id,
      data.userEmail,
      data.name || '',
      data.prompt,
      data.finalPrompt || '',
      JSON.stringify(data.params || {}),
      data.provider || '',
      data.imageKey,
      data.seed ?? null,
    ],
  );
  return rowToAsset(r.rows[0]);
}

export async function listAssetsByUser(email: string): Promise<T2IAsset[]> {
  const r = await getDb().query(
    `SELECT * FROM genshape3d_text2image_assets
     WHERE user_email = $1 AND deleted = false
     ORDER BY created_at DESC LIMIT 200`,
    [email],
  );
  return r.rows.map(rowToAsset);
}

export async function renameAsset(id: string, name: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_text2image_assets SET name=$1 WHERE id=$2`,
    [name, id],
  );
}

// Soft-delete only. Generated images aren't free either — never drop the row.
export async function deleteAsset(id: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_text2image_assets SET deleted = true WHERE id = $1`,
    [id],
  );
}
