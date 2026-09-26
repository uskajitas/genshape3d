import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Identity comes only from a Google-signed Firebase ID token. Whatever email the
// browser claims in `x-user-email` is thrown away and replaced by the verified
// one, so every existing header-based check in the app becomes trustworthy.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'uskajitas-a4844';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function list(key: string): string[] {
  return (process.env[key] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function verifiedEmail(req: Request): Promise<string | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') || '');
  if (!m || m[1].split('.').length !== 3) return null;
  try {
    const { payload } = await jwtVerify(m[1], JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ['RS256'],
    });
    if (payload.email_verified !== true || typeof payload.email !== 'string') return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}

// Sibling apps on this machine call each other directly on localhost. Anything
// that came through the Cloudflare tunnel carries cf-ray, so it is never internal.
function isInternal(req: Request): boolean {
  const ip = req.socket.remoteAddress || '';
  return !req.header('cf-ray') && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
}

export interface GateOptions {
  /** Paths (relative to where the gate is mounted) anyone may call. */
  publicPaths?: RegExp[];
  /** true = verify identity but let non-allowlisted users through (guest apps). */
  guests?: boolean;
}

/** Mount with `app.use('/api', accessGate({...}))` after express.json(). */
export function accessGate(opts: GateOptions = {}) {
  const publicPaths = opts.publicPaths || [];
  return async (req: Request, res: Response, next: NextFunction) => {
    const claimed = req.header('x-user-email');
    delete req.headers['x-user-email'];
    const email = await verifiedEmail(req);
    if (email) req.headers['x-user-email'] = email;

    if (req.method === 'OPTIONS') return next();
    if (isInternal(req)) {
      if (!email && claimed) req.headers['x-user-email'] = claimed;
      return next();
    }
    if (/\/auth\/login\/?$/.test(req.path)) {
      if (!email) return res.status(401).json({ error: 'sign in required' });
      if (req.body && typeof req.body === 'object') req.body.email = email;
    }
    if (publicPaths.some((re) => re.test(req.path))) return next();
    if (opts.guests) return next();

    if (!email) return res.status(401).json({ error: 'sign in required' });
    const allowed = list('ALLOWED_EMAILS').length ? list('ALLOWED_EMAILS') : list('ADMIN_EMAILS');
    if (!allowed.includes(email)) return res.status(403).json({ error: 'not allowed' });
    next();
  };
}
