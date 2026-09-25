// Netlify Database (Postgres). Netlify creates the database and supplies the connection
// automatically, so there is no key or password to manage.
import { getDatabase } from '@netlify/database';
import { types as neonTypes } from '@neondatabase/serverless';
import pg from 'pg';
import { HttpError } from './http';

// Return bigint ids and numeric scores as JavaScript numbers rather than strings.
for (const t of [pg.types, neonTypes]) {
  t.setTypeParser(20, (v: string) => Number(v)); // int8
  t.setTypeParser(1700, (v: string) => Number(v)); // numeric
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

let pool: Queryable | null = null;

export function dbPool(): Queryable {
  if (!pool) {
    // NETLIFY_DB_URL is set by Netlify in production and by `netlify dev`; the explicit
    // option also lets the local test stack point at its own Postgres.
    const override = process.env.NETLIFY_DB_URL;
    try {
      pool = getDatabase(override ? { connectionString: override } : {}).pool as unknown as Queryable;
    } catch (e) {
      console.error(e);
      throw new HttpError(503, 'The database is not ready yet. It is created automatically on the first deploy. Please try again in a few minutes.');
    }
  }
  return pool;
}

/** Run a parameterised query and return its rows. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    const res = await dbPool().query(text, params);
    return res.rows as T[];
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('database error:', (e as Error).message, '\n', text.slice(0, 300));
    throw new HttpError(500, 'We could not reach the database just now. Please try again in a moment.');
  }
}

/** First row or null. */
export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/**
 * Insert many rows with one statement per batch. Columns are taken from the first row.
 * `conflict` is appended verbatim (e.g. "on conflict do nothing").
 */
export async function insertMany(table: string, rows: Record<string, unknown>[], conflict = '', batch = 500): Promise<void> {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const values = slice.map((r) => `(${cols.map((c) => {
      const v = r[c];
      params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v ?? null);
      return `$${params.length}`;
    }).join(',')})`);
    await query(`insert into ${table} (${cols.join(',')}) values ${values.join(',')} ${conflict}`, params);
  }
}
