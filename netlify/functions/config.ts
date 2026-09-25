// /api/config -> public settings the browser needs (the Supabase URL and anon key are designed to be public)
import type { Config } from '@netlify/functions';
import { json } from '../lib/http';

export const config: Config = { path: '/api/config' };

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'VOYAGE_API_KEY'].filter((k) => !process.env[k]);
  return json({ supabaseUrl, supabaseAnonKey, missing });
};
