import { getSqliteDb } from './sqlite';
import { randomUUID } from 'node:crypto';

export type UserRole = 'guest' | 'free' | 'pro' | 'admin';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: UserRole;
  approved: number;
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

export function upsertOnLogin(email: string, name: string, picture: string): AppUser {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM app_users WHERE email = ?').get(email) as AppUser | undefined;

  if (existing) {
    const role: UserRole = isAdminEmail(email) ? 'admin' : existing.role;
    const credits = role === 'admin' && existing.role !== 'admin' ? CREDIT_DEFAULTS['admin'] : existing.credits;
    db.prepare('UPDATE app_users SET name = ?, picture = ?, role = ?, credits = ?, lastLoginAt = ? WHERE email = ?')
      .run(name || existing.name, picture || existing.picture, role, credits, now, email);
    return db.prepare('SELECT * FROM app_users WHERE email = ?').get(email) as AppUser;
  }

  const role: UserRole = isAdminEmail(email) ? 'admin' : 'free';
  const id = randomUUID();
  db.prepare(`
    INSERT INTO app_users (id, email, name, picture, role, approved, credits, createdAt, lastLoginAt)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, email, name, picture, role, CREDIT_DEFAULTS[role], now, now);

  return db.prepare('SELECT * FROM app_users WHERE email = ?').get(email) as AppUser;
}

export function recordLoginEvent(email: string, name: string) {
  const db = getSqliteDb();
  db.prepare('INSERT INTO login_events (id, email, name, timestamp) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), email, name, new Date().toISOString());
}

export function getAppUser(email: string): AppUser | undefined {
  return getSqliteDb().prepare('SELECT * FROM app_users WHERE email = ?').get(email) as AppUser | undefined;
}

export function listAppUsers(): AppUser[] {
  return getSqliteDb().prepare('SELECT * FROM app_users ORDER BY createdAt DESC').all() as AppUser[];
}

export function setUserRole(id: string, role: UserRole) {
  getSqliteDb().prepare('UPDATE app_users SET role = ?, credits = ? WHERE id = ?')
    .run(role, CREDIT_DEFAULTS[role], id);
}

export function deductCredit(email: string): boolean {
  const db = getSqliteDb();
  const user = getAppUser(email);
  if (!user || user.credits <= 0) return false;
  db.prepare('UPDATE app_users SET credits = credits - 1 WHERE email = ?').run(email);
  return true;
}
