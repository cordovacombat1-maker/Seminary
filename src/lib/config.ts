import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PublicConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  missing: string[];
}

let supabase: SupabaseClient | null = null;
let config: PublicConfig | null = null;

/** Fetch runtime settings from /api/config and create the Supabase client once. */
export async function loadConfig(): Promise<PublicConfig> {
  if (config) return config;
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Could not load site settings.');
  config = (await res.json()) as PublicConfig;
  if (config.supabaseUrl && config.supabaseAnonKey) {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return config;
}

export function db(): SupabaseClient {
  if (!supabase) throw new Error('The site is not connected to its database yet.');
  return supabase;
}
