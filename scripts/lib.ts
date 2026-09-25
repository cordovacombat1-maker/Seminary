// Helpers shared by the ingestion scripts (run on your own computer, not on Netlify).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const CACHE = path.join(ROOT, 'scripts', '.cache');

/** Load KEY=value lines from .env (or the file named by ENV_FILE) into process.env. */
export function loadEnv(): void {
  const file = process.env.ENV_FILE ?? path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function requireEnv(...names: string[]): void {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`\nMissing settings: ${missing.join(', ')}\nCreate a file named .env in the project folder (copy .env.example) and fill these in. See the README.\n`);
    process.exit(1);
  }
}

export function supabaseAdmin(): SupabaseClient {
  requireEnv('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(what: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      const wait = 2000 * 2 ** (i - 1);
      console.warn(`  ${what} failed (${(e as Error).message}); retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
}

/** Download a URL (cached in scripts/.cache). Returns null on 404. */
export async function download(url: string, cacheName?: string): Promise<string | null> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, cacheName ?? url.replace(/[^a-z0-9.]+/gi, '_').slice(-150));
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const text = await withRetry(`download ${url}`, async () => {
    const res = await fetch(url, { headers: { 'user-agent': 'seminary-app-ingest/1.0 (educational, one-time download)' }, redirect: 'follow' });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }, 3).catch((e) => {
    console.warn(`  could not download ${url}: ${(e as Error).message}`);
    return null;
  });
  if (text) writeFileSync(file, text);
  return text;
}

export async function upsertBatches(db: SupabaseClient, table: string, rows: object[], onConflict: string, batch = 1000): Promise<void> {
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    await withRetry(`${table} batch ${i / batch + 1}`, async () => {
      const { error } = await db.from(table).upsert(slice, { onConflict });
      if (error) throw new Error(error.message);
    });
    process.stdout.write(`\r  ${table}: ${Math.min(i + batch, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
  }
  process.stdout.write('\n');
}

/** True when this file is being run directly (works on Windows, macOS and Linux). */
export function isMain(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1]);
}
