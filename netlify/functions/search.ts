// /api/search?q=...&tradition=...  -> cited passages from the library
import type { Config } from '@netlify/functions';
import { searchLibrary } from '../lib/biblical';
import { handle, HttpError, json } from '../lib/http';
import { adminClient, requireUser } from '../lib/supabase';

export const config: Config = { path: '/api/search' };

export default handle(async (req: Request) => {
  await requireUser(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) throw new HttpError(400, 'Type something to search for.');
  const res = await searchLibrary(adminClient(), q.slice(0, 500), { tradition: url.searchParams.get('tradition'), count: 10 });
  return json(res);
});
