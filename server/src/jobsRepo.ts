import { getDb } from './db';
import { randomUUID } from 'node:crypto';

export interface Job {
  id: string;
  userEmail: string;
  imageUrl: string;
  name: string;
  prompt: string;
  style: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';
  resultUrl: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  polygonBudget: string;
  textureRes: string;
  exportFormat: string;
  detailLevel: string;
  doTexture: boolean;
  progressPct: number;
  progressPhase: string;
  progressStep: number;
  progressTotal: number;
  requestCancel: boolean;
  octreeResolution: number;
  targetFaceCount: number;
  inferenceSteps: number;
  guidanceScale: number;
  numChunks: number;
  seed: number;
}

export async function deleteJob(id: string): Promise<void> {
  await getDb().query(`DELETE FROM genshape3d_jobs WHERE id=$1`, [id]);
}

export async function renameJob(id: string, name: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET name=$1, "updatedAt"=$2 WHERE id=$3`,
    [name, new Date().toISOString(), id]
  );
}

export async function cancelJob(id: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET "requestCancel" = true WHERE id = $1`,
    [id]
  );
}

export async function createJob(data: {
  userEmail: string;
  imageUrl: string;
  prompt?: string;
  style?: string;
  polygonBudget?: string;
  textureRes?: string;
  exportFormat?: string;
  detailLevel?: string;
  doTexture?: boolean;
  octreeResolution?: number;
  targetFaceCount?: number;
  inferenceSteps?: number;
  guidanceScale?: number;
  numChunks?: number;
  seed?: number;
}): Promise<Job> {
  const now = new Date().toISOString();
  const { rows } = await getDb().query(
    `INSERT INTO genshape3d_jobs
      (id, "userEmail", "imageUrl", prompt, style, status, "resultUrl", "createdAt", "updatedAt",
       "polygonBudget", "textureRes", "exportFormat", "detailLevel", "doTexture",
       "octreeResolution", "targetFaceCount", "inferenceSteps", "guidanceScale", "numChunks", seed)
     VALUES ($1,$2,$3,$4,$5,'pending','',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      randomUUID(), data.userEmail, data.imageUrl,
      data.prompt || '', data.style || 'Realistic', now, now,
      data.polygonBudget || 'Medium (50k-200k)',
      data.textureRes    || '1K',
      data.exportFormat  || 'GLB',
      data.detailLevel   || 'Standard',
      data.doTexture     ?? false,
      data.octreeResolution ?? 0,
      data.targetFaceCount  ?? 0,
      data.inferenceSteps   ?? 0,
      data.guidanceScale    ?? 0,
      data.numChunks        ?? 0,
      data.seed             ?? 0,
    ]
  );
  return rows[0];
}

export async function getJobsByUser(userEmail: string): Promise<Job[]> {
  const { rows } = await getDb().query(
    'SELECT * FROM genshape3d_jobs WHERE "userEmail"=$1 ORDER BY "createdAt" DESC',
    [userEmail]
  );
  return rows;
}

export async function listAllJobs(): Promise<Job[]> {
  const { rows } = await getDb().query('SELECT * FROM genshape3d_jobs ORDER BY "createdAt" DESC');
  return rows;
}

export async function listPendingJobs(): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs WHERE status='pending' ORDER BY "createdAt" ASC`
  );
  return rows;
}

export async function listCancelledJobs(): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs WHERE status='cancelled' ORDER BY "completedAt" DESC`
  );
  return rows;
}

export async function updateJobStatus(id: string, status: Job['status'], resultUrl = ''): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET status=$1, "resultUrl"=$2, "updatedAt"=$3 WHERE id=$4`,
    [status, resultUrl, new Date().toISOString(), id]
  );
}
