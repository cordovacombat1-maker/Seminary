// /api/config -> is the site ready? (database created, AI switched on, texts loaded)
import type { Config } from '@netlify/functions';
import { aiAvailable } from '../lib/anthropic';
import { one } from '../lib/db';
import { json } from '../lib/http';

export const config: Config = { path: '/api/config' };

export default async () => {
  let database = false;
  let hasAccounts = false;
  let textsLoaded = false;
  try {
    const row = await one<{ users: boolean; verses: boolean }>(
      'select exists (select 1 from users) as users, exists (select 1 from bible_verses) as verses',
    );
    database = true;
    hasAccounts = !!row?.users;
    textsLoaded = !!row?.verses;
  } catch {
    database = false;
  }
  return json({ database, ai: aiAvailable(), hasAccounts, textsLoaded });
};
