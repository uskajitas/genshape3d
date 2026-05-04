import { getDb } from './db';
import { randomUUID } from 'node:crypto';

export type UserRole = 'guest' | 'free' | 'pro' | 'admin';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: UserRole;
  approved: boolean;
  credits: number;
  createdAt: string;
  lastLoginAt: string;
}

const CREDIT_DEFAULTS: Record<UserRole, number> = {
  guest: 0,
  free: 10,
  pro: 200,
  admin: 9999,
};

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email);
}

export async function upsertOnLogin(email: string, name: string, picture: string): Promise<AppUser> {
  const db = getDb();
  const now = new Date().toISOString();

  const { rows } = await db.query('SELECT * FROM genshape3d_users WHERE email = $1', [email]);
  const existing = rows[0] as AppUser | undefined;

  if (existing) {
    const role: UserRole = isAdminEmail(email) ? 'admin' : existing.role;
    const credits = role === 'admin' && existing.role !== 'admin' ? CREDIT_DEFAULTS['admin'] : existing.credits;
    const res = await db.query(
      `UPDATE genshape3d_users SET name=$1, picture=$2, role=$3, credits=$4, "lastLoginAt"=$5 WHERE email=$6 RETURNING *`,
      [name || existing.name, picture || existing.picture, role, credits, now, email]
    );
    return res.rows[0];
  }

  const role: UserRole = isAdminEmail(email) ? 'admin' : 'free';
  const res = await db.query(
    `INSERT INTO genshape3d_users (id, email, name, picture, role, approved, credits, "createdAt", "lastLoginAt")
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8) RETURNING *`,
    [randomUUID(), email, name, picture, role, CREDIT_DEFAULTS[role], now, now]
  );
  return res.rows[0];
}

export async function recordLoginEvent(email: string, name: string): Promise<void> {
  await getDb().query(
    'INSERT INTO genshape3d_login_events (id, email, name, timestamp) VALUES ($1,$2,$3,$4)',
    [randomUUID(), email, name, new Date().toISOString()]
  );
}

export async function getAppUser(email: string): Promise<AppUser | undefined> {
  const { rows } = await getDb().query('SELECT * FROM genshape3d_users WHERE email = $1', [email]);
  return rows[0];
}

export async function listAppUsers(): Promise<AppUser[]> {
  const { rows } = await getDb().query('SELECT * FROM genshape3d_users ORDER BY "createdAt" DESC');
  return rows;
}

export async function setUserRole(id: string, role: UserRole): Promise<void> {
  await getDb().query(
    'UPDATE genshape3d_users SET role=$1, credits=$2 WHERE id=$3',
    [role, CREDIT_DEFAULTS[role], id]
  );
}

export async function deductCredit(email: string): Promise<boolean> {
  const user = await getAppUser(email);
  if (!user || user.credits <= 0) return false;
  await getDb().query('UPDATE genshape3d_users SET credits = credits - 1 WHERE email = $1', [email]);
  return true;
}

/**
 * Grant credits to a user (top-up from a Stripe purchase, promo, refund, etc).
 * Idempotent on `ref`: if a credit_ledger entry already exists with the same
 * ref, this is a no-op — Stripe occasionally redelivers webhooks and we don't
 * want to grant twice.
 */
export async function addCredits(
  email: string,
  amount: number,
  meta: { kind: 'topup' | 'promo' | 'refund'; ref: string },
): Promise<void> {
  if (amount <= 0) return;
  const db = getDb();

  // Best-effort ledger — table may not exist on older deployments. Create on
  // demand so this works without a separate migration step in early dev.
  await db.query(`
    CREATE TABLE IF NOT EXISTS genshape3d_credit_ledger (
      id           SERIAL PRIMARY KEY,
      email        TEXT NOT NULL,
      delta        INTEGER NOT NULL,
      kind         TEXT NOT NULL,
      ref          TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Idempotency check via UNIQUE(ref): if the insert conflicts, we've already
  // processed this event — skip the credit bump.
  const ins = await db.query(
    `INSERT INTO genshape3d_credit_ledger (email, delta, kind, ref)
     VALUES ($1, $2, $3, $4) ON CONFLICT (ref) DO NOTHING RETURNING id`,
    [email, amount, meta.kind, meta.ref],
  );
  if (ins.rowCount === 0) return; // duplicate webhook delivery

  await db.query(
    'UPDATE genshape3d_users SET credits = credits + $1 WHERE email = $2',
    [amount, email],
  );
}
