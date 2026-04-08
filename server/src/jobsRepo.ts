import { getSqliteDb } from './sqlite';
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

export function createJob(data: {
  userEmail: string;
  imageUrl: string;
  prompt?: string;
  style?: string;
}): Job {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    userEmail: data.userEmail,
    imageUrl: data.imageUrl,
    prompt: data.prompt || '',
    style: data.style || 'Realistic',
    status: 'pending',
    resultUrl: '',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO genshape3d_jobs
      (id, userEmail, imageUrl, prompt, style, status, resultUrl, createdAt, updatedAt)
    VALUES
      (@id, @userEmail, @imageUrl, @prompt, @style, @status, @resultUrl, @createdAt, @updatedAt)
  `).run(job);
  return job;
}

export function getJobsByUser(userEmail: string): Job[] {
  return getSqliteDb()
    .prepare('SELECT * FROM genshape3d_jobs WHERE userEmail = ? ORDER BY createdAt DESC')
    .all(userEmail) as Job[];
}

export function updateJobStatus(id: string, status: Job['status'], resultUrl = ''): void {
  getSqliteDb()
    .prepare('UPDATE genshape3d_jobs SET status = ?, resultUrl = ?, updatedAt = ? WHERE id = ?')
    .run(status, resultUrl, new Date().toISOString(), id);
}

export function listAllJobs(): Job[] {
  return getSqliteDb()
    .prepare('SELECT * FROM genshape3d_jobs ORDER BY createdAt DESC')
    .all() as Job[];
}

export function listPendingJobs(): Job[] {
  return getSqliteDb()
    .prepare("SELECT * FROM genshape3d_jobs WHERE status = 'pending' ORDER BY createdAt ASC")
    .all() as Job[];
}
