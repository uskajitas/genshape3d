import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import multer from 'multer';
import { initDb } from './db';
import {
  upsertOnLogin, recordLoginEvent, getAppUser,
  listAppUsers, setUserRole, deductCredit,
  isAdminEmail, UserRole,
} from './usersRepo';
import { uploadToR2, getR2Stream } from './r2';
import { createJob, getJobsByUser, listAllJobs, listPendingJobs, listCancelledJobs, updateJobStatus, cancelJob } from './jobsRepo';

const app = express();
const port = process.env.PORT || 4242;
const clientOrigin = process.env.CLIENT_ORIGIN_URL || 'http://localhost:3232';

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── JWT middleware ─────────────────────────────────────────────────────────────

const domain = process.env.AUTH0_DOMAIN;
const audience = process.env.AUTH0_AUDIENCE;

const checkJwt = domain && audience
  ? jwt({
      secret: jwksRsa.expressJwtSecret({
        cache: true, rateLimit: true, jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }) as any,
      audience,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    })
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Image proxy from R2 ───────────────────────────────────────────────────────

app.get('/api/image', async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const obj = await getR2Stream(key);
    res.setHeader('Content-Type', (obj.ContentType as string) || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    (obj.Body as any).pipe(res);
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email, name, picture } = req.body as { email?: string; name?: string; picture?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const user = await upsertOnLogin(email, name || '', picture || '');
    await recordLoginEvent(email, name || '');
    res.json({ user });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await getAppUser(email);
  if (!user) return res.json({ approved: false, role: 'free', exists: false, credits: 0 });
  res.json({
    approved: Boolean(user.approved),
    role: user.role,
    exists: true,
    credits: user.credits,
    name: user.name,
    picture: user.picture,
  });
});

// ── Upload → R2 → job ─────────────────────────────────────────────────────────

app.post('/api/upload', upload.single('image'), async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!req.file) return res.status(400).json({ error: 'image required' });
  try {
    const { url } = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    const job = await createJob({
      userEmail:     email,
      imageUrl:      url,
      prompt:        req.body.prompt        || '',
      style:         req.body.style         || 'Realistic',
      polygonBudget:    req.body.polygonBudget || 'Medium (50k-200k)',
      textureRes:       req.body.textureRes    || '1K',
      exportFormat:     req.body.exportFormat  || 'GLB',
      detailLevel:      req.body.detailLevel   || 'Standard',
      doTexture:        req.body.doTexture === 'true' || req.body.doTexture === true,
      octreeResolution: parseInt(req.body.octreeResolution) || 0,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || 0,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || 0,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || 0,
      numChunks:        parseInt(req.body.numChunks)        || 0,
      seed:             parseInt(req.body.seed)             || 0,
    });
    res.json({ job });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  res.json({ jobs: await getJobsByUser(email) });
});

app.patch('/api/jobs/:id/cancel', async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await cancelJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Generate ──────────────────────────────────────────────────────────────────

app.post('/api/generate', checkJwt, async (req, res) => {
  const auth = (req as any).auth;
  const email = auth?.['https://genshape3d/email'] || auth?.email;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const ok = await deductCredit(email);
  if (!ok) return res.status(402).json({ error: 'Insufficient credits' });
  res.json({ ok: true, status: 'queued' });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/api/mgmt/users', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ users: await listAppUsers() });
});

app.patch('/api/mgmt/users/:id/role', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.body as { role: UserRole };
  const validRoles: UserRole[] = ['free', 'pro', 'admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await setUserRole(req.params.id, role);
  res.json({ ok: true });
});

app.get('/api/admin/jobs', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const filter = req.query.filter as string;
  const jobs = filter === 'pending' ? await listPendingJobs()
    : filter === 'cancelled' ? await listCancelledJobs()
    : await listAllJobs();
  res.json({ jobs });
});

app.patch('/api/admin/jobs/:id/status', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { status, resultUrl } = req.body as { status: string; resultUrl?: string };
  await updateJobStatus(req.params.id as any, status as any, resultUrl);
  res.json({ ok: true });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initDb().then(() => {
  app.listen(port, () => console.log(`GenShape3D API listening on http://localhost:${port}`));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
