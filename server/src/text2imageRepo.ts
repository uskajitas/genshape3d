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
  /** When set, this row is an alt view generated from the parent asset.
   *  NULL = primary / front view. */
  parentAssetId: string | null;
  /** Human-readable angle label: 'front' | 'three_q' | 'side' | 'back'. */
  viewLabel: string;
  /** When false, the image is excluded from the 3D-conversion picker. */
  readyFor3D: boolean;
  /** Set when imageKey is an edited version (e.g. background removed).
   *  Points to the original R2 key so we can re-edit / revert. */
  originalImageKey: string | null;
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
  parentAssetId: r.parentAssetId ?? null,
  viewLabel:   r.viewLabel ?? '',
  readyFor3D:  r.readyFor3D ?? true,
  originalImageKey: r.originalImageKey ?? null,
});

// Caller-side shape: most fields required, but originalImageKey is set
// later via applyAssetEdit() — never on initial creation.
export type CreateAssetInput =
  Omit<T2IAsset, 'id' | 'createdAt' | 'originalImageKey'>;

export async function createAsset(data: CreateAssetInput): Promise<T2IAsset> {
  const id = randomUUID();
  const r = await getDb().query(
    `INSERT INTO genshape3d_text2image_assets
       (id, user_email, name, prompt, final_prompt, params, provider, image_key, seed,
        "parentAssetId", "viewLabel", "readyFor3D")
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
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
      data.parentAssetId ?? null,
      data.viewLabel || '',
      data.readyFor3D ?? true,
    ],
  );
  return rowToAsset(r.rows[0]);
}

/** Replace the asset's image_key with a new one (no original-preserve
 *  semantics). Used when regenerating an alt view: the OLD bytes are
 *  thrown away, the NEW ones take their place. The R2 key for the old
 *  bytes is left orphaned in storage.  */
export async function replaceAssetImageKey(id: string, newImageKey: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_text2image_assets SET image_key = $1 WHERE id = $2`,
    [newImageKey, id],
  );
}

/** Toggle the readyFor3D flag on a single asset. */
export async function setAssetReadyFor3D(id: string, ready: boolean): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_text2image_assets SET "readyFor3D"=$1 WHERE id=$2`,
    [ready, id],
  );
}

/** Replace the asset's image_key with a new edited version, preserving
 *  the original (if not already preserved). Idempotent: re-edits don't
 *  overwrite originalImageKey. */
export async function applyAssetEdit(id: string, newImageKey: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_text2image_assets
        SET "originalImageKey" = COALESCE("originalImageKey", image_key),
            image_key           = $1
      WHERE id = $2`,
    [newImageKey, id],
  );
}

/** Revert: swap originalImageKey back to image_key, clear originalImageKey.
 *  No-op if no original is recorded. */
export async function revertAssetEdit(id: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_text2image_assets
        SET image_key = "originalImageKey",
            "originalImageKey" = NULL
      WHERE id = $1 AND "originalImageKey" IS NOT NULL`,
    [id],
  );
}

/** Fetch a single asset by id (and verify ownership). Used by the alt-views
 *  endpoint to look up the front-view image before generating others. */
export async function getAssetById(id: string, email: string): Promise<T2IAsset | null> {
  const r = await getDb().query(
    `SELECT * FROM genshape3d_text2image_assets
     WHERE id = $1 AND user_email = $2 AND deleted = false LIMIT 1`,
    [id, email],
  );
  return r.rows[0] ? rowToAsset(r.rows[0]) : null;
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
