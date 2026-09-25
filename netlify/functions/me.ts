// /api/me -> who am I, and am I the admin?
import type { Config } from '@netlify/functions';
import { dailyMessageLimit } from '../lib/env';
import { handle, json } from '../lib/http';
import { requireUser } from '../lib/supabase';

export const config: Config = { path: '/api/me' };

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  return json({ id: user.id, email: user.email, isAdmin: user.isAdmin, dailyLimit: dailyMessageLimit() });
});
