import { getDb } from './db';
import { randomUUID } from 'node:crypto';

export interface Job {
  id: string;
  userEmail: string;
  imageUrl: string;
  prompt: string;
  style: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  resultUrl: string;
  createdAt: string;
  updatedAt: string;
}

export async function createJob(data: {
  userEmail: string;
  imageUrl: string;
  prompt?: string;
  style?: string;
}): Promise<Job> {
  const now = new Date().toISOString();
  const { rows } = await getDb().query(
    `INSERT INTO genshape3d_jobs (id, "userEmail", "imageUrl", prompt, style, status, "resultUrl", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,'pending','',$6,$7) RETURNING *`,
    [randomUUID(), data.userEmail, data.imageUrl, data.prompt || '', data.style || 'Realistic', now, now]
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

export async function updateJobStatus(id: string, status: Job['status'], resultUrl = ''): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET status=$1, "resultUrl"=$2, "updatedAt"=$3 WHERE id=$4`,
    [status, resultUrl, new Date().toISOString(), id]
  );
}
