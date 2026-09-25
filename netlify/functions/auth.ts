// /api/auth
//   POST { action: "signup", email, password, fullName } -> { token, user }
//   POST { action: "login", email, password }            -> { token, user }
//   POST { action: "logout" }
//   POST { action: "change_password", currentPassword, newPassword }
//   POST { action: "update_name", fullName }
import type { Config } from '@netlify/functions';
import {
  adminFlag,
  bearerToken,
  createSession,
  endSession,
  hashPassword,
  normalizeEmail,
  requireUser,
  validatePassword,
  verifyPassword,
} from '../lib/auth';
import { one, query } from '../lib/db';
import { handle, HttpError, json, readJson } from '../lib/http';

export const config: Config = { path: '/api/auth' };

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  password_hash: string;
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, fullName: u.full_name, isAdmin: adminFlag(u) });
const cleanName = (n: unknown) => (typeof n === 'string' ? n.trim().slice(0, 120) : '');
const pause = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 400));

export default handle(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const body = await readJson<Record<string, unknown>>(req);

  switch (body.action) {
    case 'signup': {
      const email = normalizeEmail(body.email);
      const password = validatePassword(body.password);
      const fullName = cleanName(body.fullName);
      if (!fullName) throw new HttpError(400, 'Please enter your full name (it appears on your certificates).');
      if (await one('select 1 from users where lower(email) = lower($1)', [email])) {
        throw new HttpError(409, 'An account with that email already exists. Try logging in instead.');
      }
      // The very first account becomes the administrator (unless ADMIN_EMAIL names someone else).
      const user = await one<UserRow>(
        `insert into users (email, full_name, password_hash, is_admin)
         values ($1, $2, $3, not exists (select 1 from users))
         returning *`,
        [email, fullName, await hashPassword(password)],
      );
      return json({ token: await createSession(user!.id), user: publicUser(user!) });
    }

    case 'login': {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const user = await one<UserRow>('select * from users where lower(email) = lower($1)', [email]);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        await pause(); // slow down password guessing
        throw new HttpError(401, 'That email and password don’t match. Please try again.');
      }
      return json({ token: await createSession(user.id), user: publicUser(user) });
    }

    case 'logout': {
      const token = bearerToken(req);
      if (token) await endSession(token);
      return json({ ok: true });
    }

    case 'change_password': {
      const me = await requireUser(req);
      const newPassword = validatePassword(body.newPassword);
      const user = await one<UserRow>('select * from users where id = $1', [me.id]);
      if (!user || !(await verifyPassword(String(body.currentPassword ?? ''), user.password_hash))) {
        await pause();
        throw new HttpError(400, 'Your current password is not correct.');
      }
      await query('update users set password_hash = $1 where id = $2', [await hashPassword(newPassword), me.id]);
      // Log out every other device
      await query('delete from sessions where user_id = $1 and token_hash <> encode(sha256(convert_to($2, \'UTF8\')), \'hex\')', [me.id, bearerToken(req)]);
      return json({ ok: true });
    }

    case 'update_name': {
      const me = await requireUser(req);
      const fullName = cleanName(body.fullName);
      if (!fullName) throw new HttpError(400, 'Please enter your name.');
      await query('update users set full_name = $1 where id = $2', [fullName, me.id]);
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, 'Unknown action.');
  }
});
