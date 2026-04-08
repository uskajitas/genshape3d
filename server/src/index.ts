import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { initSqlite } from './sqlite';
import {
  upsertOnLogin, recordLoginEvent, getAppUser,
  listAppUsers, setUserRole, deductCredit,
  isAdminEmail, UserRole,
} from './usersRepo';

dotenv.config();

const app = express();
const port = process.env.PORT || 4242;
const clientOrigin = process.env.CLIENT_ORIGIN_URL || 'http://localhost:3001';

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

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

// ── Boot ──────────────────────────────────────────────────────────────────────

initSqlite();

app.listen(port, () => {
  console.log(`GenShape3D API listening on http://localhost:${port}`);
});
