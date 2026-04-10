import { getDb } from './db';
import { randomUUID } from 'node:crypto';

export interface Job {
  id: string;
  userEmail: string;
  imageUrl: string;
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
}): Promise<Job> {
  const now = new Date().toISOString();
  const { rows } = await getDb().query(
    `INSERT INTO genshape3d_jobs
      (id, "userEmail", "imageUrl", prompt, style, status, "resultUrl", "createdAt", "updatedAt",
       "polygonBudget", "textureRes", "exportFormat", "detailLevel", "doTexture")
     VALUES ($1,$2,$3,$4,$5,'pending','',$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      randomUUID(), data.userEmail, data.imageUrl,
      data.prompt || '', data.style || 'Realistic', now, now,
      data.polygonBudget || 'Medium (50k-200k)',
      data.textureRes    || '1K',
      data.exportFormat  || 'GLB',
      data.detailLevel   || 'Standard',
      data.doTexture     ?? false,
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
