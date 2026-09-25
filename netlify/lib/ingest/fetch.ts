// Downloading public-domain / openly licensed source texts for the loader.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1000 * 2 ** (i - 1));
    }
  }
}

/**
 * Download a URL as text. Returns null if it is missing or unreachable.
 * (INGEST_CACHE_DIR, used only by the local test stack, keeps copies on disk.)
 */
export async function download(url: string, cacheName?: string): Promise<string | null> {
  const dir = process.env.INGEST_CACHE_DIR;
  const file = dir ? path.join(dir, cacheName ?? url.replace(/[^a-z0-9.]+/gi, '_').slice(-150)) : null;
  if (file && existsSync(file)) return readFileSync(file, 'utf8');
  const text = await withRetry(async () => {
    const res = await fetch(url, {
      headers: { 'user-agent': 'seminary-app-loader/1.0 (educational, one-time download)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }, 2).catch((e) => {
    console.warn(`could not download ${url}: ${(e as Error).message}`);
    return null;
  });
  if (text && file) {
    mkdirSync(dir!, { recursive: true });
    writeFileSync(file, text);
  }
  return text;
}
