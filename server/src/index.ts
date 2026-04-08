import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import multer from 'multer';
import { initSqlite } from './sqlite';
import {
  upsertOnLogin, recordLoginEvent, getAppUser,
  listAppUsers, setUserRole, deductCredit,
  isAdminEmail, UserRole,
} from './usersRepo';
import { uploadToR2 } from './r2';
import { createJob, getJobsByUser, listAllJobs, listPendingJobs, updateJobStatus } from './jobsRepo';

dotenv.config();

const app = express();
const port = process.env.PORT || 4242;
const clientOrigin = process.env.CLIENT_ORIGIN_URL || 'http://localhost:3001';

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── JWT middleware (only used on protected routes) ─────────────────────────────

const domain = process.env.AUTH0_DOMAIN;
const audience = process.env.AUTH0_AUDIENCE;

const checkJwt = domain && audience
  ? jwt({
      secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }) as any,
      audience,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    })
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

// ── Public ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Auth: login upsert + me check ─────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { email, name, picture } = req.body as { email?: string; name?: string; picture?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = upsertOnLogin(email, name || '', picture || '');
  recordLoginEvent(email, name || '');
  res.json({ user });
});

app.get('/api/auth/me', (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = getAppUser(email);
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

// ── Upload image → R2 → create job ───────────────────────────────────────────

app.post('/api/upload', upload.single('image'), async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!req.file) return res.status(400).json({ error: 'image required' });

  try {
    const { url } = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    const job = createJob({
      userEmail: email,
      imageUrl: url,
      prompt: req.body.prompt || '',
      style: req.body.style || 'Realistic',
    });
    res.json({ job });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

app.get('/api/jobs', (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  res.json({ jobs: getJobsByUser(email) });
});

// ── Generations ───────────────────────────────────────────────────────────────

app.post('/api/generate', checkJwt, (req, res) => {
  const auth = (req as any).auth;
  const email = auth?.['https://genshape3d/email'] || auth?.email;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const ok = deductCredit(email);
  if (!ok) return res.status(402).json({ error: 'Insufficient credits' });

  // In production, kick off actual AI generation here
  res.json({ ok: true, status: 'queued', message: 'Generation queued' });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/api/mgmt/users', (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ users: listAppUsers() });
});

app.patch('/api/mgmt/users/:id/role', (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.body as { role: UserRole };
  const validRoles: UserRole[] = ['free', 'pro', 'admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  setUserRole(req.params.id, role);
  res.json({ ok: true });
});

app.get('/api/admin/jobs', (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const filter = req.query.filter as string;
  const jobs = filter === 'pending' ? listPendingJobs() : listAllJobs();
  res.json({ jobs });
});

app.patch('/api/admin/jobs/:id/status', (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { status, resultUrl } = req.body as { status: string; resultUrl?: string };
  updateJobStatus(req.params.id as any, status as any, resultUrl);
  res.json({ ok: true });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initSqlite();

app.listen(port, () => {
  console.log(`GenShape3D API listening on http://localhost:${port}`);
});
