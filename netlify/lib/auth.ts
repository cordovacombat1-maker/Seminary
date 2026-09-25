// Accounts and logins, stored in the app's own database (no outside login service, no keys).
// Passwords are hashed with scrypt. A login creates a random token; only its SHA-256 hash is
// stored, so a copy of the database cannot be used to log in as anyone.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { one, query } from './db';
import { HttpError } from './http';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 30;

export interface AuthedUser {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { ...SCRYPT, N: Number(n) });
  return timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  // Tidy up old sessions now and then
  if (Math.random() < 0.05) await query('delete from sessions where expires_at < now()');
  return token;
}

export async function endSession(token: string): Promise<void> {
  await query('delete from sessions where token_hash = $1', [sha256(token)]);
}

export function bearerToken(req: Request): string {
  return (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

/** The administrator is the account named in ADMIN_EMAIL (optional) or, by default, the first account created. */
export function adminFlag(row: { email: string; is_admin: boolean }): boolean {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (configured) return row.email.toLowerCase() === configured;
  return row.is_admin;
}

export async function requireUser(req: Request): Promise<AuthedUser> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Please log in first.');
  const row = await one<{ id: string; email: string; full_name: string; is_admin: boolean }>(
    `select u.id, u.email, u.full_name, u.is_admin
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) throw new HttpError(401, 'Your session has expired. Please log in again.');
  return { id: row.id, email: row.email, fullName: row.full_name, isAdmin: adminFlag(row) };
}

export function validatePassword(password: unknown): string {
  const p = typeof password === 'string' ? password : '';
  if (p.length < 8) throw new HttpError(400, 'Please choose a password of at least 8 characters.');
  if (p.length > 200) throw new HttpError(400, 'That password is too long.');
  return p;
}

export function normalizeEmail(email: unknown): string {
  const e = typeof email === 'string' ? email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new HttpError(400, 'Please enter a valid email address.');
  return e;
}

/** A readable temporary password for administrator resets, e.g. "maple-river-4821". */
export function temporaryPassword(): string {
  const words = ['grace', 'faith', 'hope', 'light', 'olive', 'cedar', 'river', 'stone', 'psalm', 'dove', 'vine', 'lamp', 'bread', 'shield', 'crown', 'harbor'];
  const b = randomBytes(4);
  return `${words[b[0] % words.length]}-${words[b[1] % words.length]}-${1000 + (b.readUInt16BE(2) % 9000)}`;
}
