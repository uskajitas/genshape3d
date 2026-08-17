import { randomUUID } from 'node:crypto';
import { getDb, dbQuery } from './db';

export interface TextureJob {
  id: string;
  userEmail: string;
  sourceJobId: string;
  sourceModelUrl: string;
  prompt: string;
  materialPreset: string;
  referenceImageKey: string;
  textureRes: string;
  maps: string[];
  variants: number;
  seed: number;
  strength: number;
  keepShape: boolean;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';
  resultUrl: string;
  errorMessage: string;
  progressPct: number;
  progressPhase: string;
  sourceImageUrl: string;
  assignedWorkerId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function createTextureJob(data: {
  userEmail: string;
  sourceJobId: string;
  sourceModelUrl: string;
  prompt?: string;
  materialPreset?: string;
  referenceImageKey?: string;
  textureRes?: string;
  maps?: string[];
  variants?: number;
  seed?: number;
  strength?: number;
  keepShape?: boolean;
  sourceImageUrl?: string;
}): Promise<TextureJob> {
  const { rows } = await dbQuery(
    `INSERT INTO genshape3d_texture_jobs
      (id, "userEmail", "sourceJobId", "sourceModelUrl", prompt, "materialPreset",
       "referenceImageKey", "textureRes", maps, variants, seed, strength, "keepShape", "sourceImageUrl")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      randomUUID(),
      data.userEmail,
      data.sourceJobId,
      data.sourceModelUrl,
      data.prompt || '',
      data.materialPreset || 'Auto',
      data.referenceImageKey || '',
      data.textureRes || '2K',
      JSON.stringify(data.maps?.length ? data.maps : ['baseColor', 'roughness', 'normal']),
      Math.max(1, Math.min(4, data.variants || 1)),
      data.seed || 0,
      Math.max(0, Math.min(100, data.strength ?? 65)),
      data.keepShape ?? true,
      data.sourceImageUrl || '',
    ],
  );
  return rows[0];
}

export async function getTextureJobsByUser(userEmail: string): Promise<TextureJob[]> {
  const { rows } = await dbQuery(
    `SELECT * FROM genshape3d_texture_jobs
     WHERE "userEmail" = $1 AND deleted = false
     ORDER BY "createdAt" DESC`,
    [userEmail],
  );
  return rows;
}

export async function getTextureJobsForSource(sourceJobId: string, userEmail: string): Promise<TextureJob[]> {
  const { rows } = await dbQuery(
    `SELECT * FROM genshape3d_texture_jobs
     WHERE "sourceJobId" = $1 AND "userEmail" = $2 AND deleted = false
     ORDER BY "createdAt" DESC`,
    [sourceJobId, userEmail],
  );
  return rows;
}

export async function getTextureJobById(id: string): Promise<TextureJob | null> {
  const { rows } = await dbQuery(
    `SELECT * FROM genshape3d_texture_jobs WHERE id = $1 AND deleted = false`,
    [id],
  );
  return rows[0] || null;
}

// Soft-delete — GPU time is expensive, rows are hidden, never dropped
// (same policy as genshape3d_jobs).
export async function deleteTextureJob(id: string): Promise<void> {
  await dbQuery(
    `UPDATE genshape3d_texture_jobs SET deleted = true, "updatedAt" = NOW() WHERE id = $1`,
    [id],
  );
}
