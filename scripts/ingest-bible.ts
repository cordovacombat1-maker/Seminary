// npm run ingest:bible
// Loads three public-domain English Bibles verse by verse into the bible_verses table:
//   BSB — Berean Standard Bible (public domain since April 30, 2023) — from bereanbible.com
//   KJV — King James Version (public domain)
//   WEB — World English Bible (public domain)
// If an official site is unreachable, a GitHub mirror of the same public-domain text is used.
import { BOOKS, findBook } from '../shared/books';
import { download, isMain, loadEnv, supabaseAdmin, upsertBatches } from './lib';

type Row = { translation: string; book: string; chapter: number; verse: number; text: string };

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^"|"$/g, '').trim();

/** "Genesis 1:1<TAB>In the beginning…" (the format of bereanbible.com/bsb.txt) */
export function parseTabbed(text: string, translation: string): Row[] {
  const rows: Row[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?) (\d+):(\d+)\t(.+)$/);
    if (!m) continue;
    const book = findBook(m[1]);
    if (!book) continue;
    rows.push({ translation, book, chapter: Number(m[2]), verse: Number(m[3]), text: clean(m[4].split('\t')[0]) });
  }
  return rows;
}

/** CSV "Book,Chapter,Verse,Text" (the format of the scrollmapper GitHub mirror) */
export function parseCsv(text: string, translation: string): Row[] {
  const rows: Row[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const m = line.match(/^("?)(.+?)\1,(\d+),(\d+),(.*)$/);
    if (!m) continue;
    const book = findBook(m[2]);
    if (!book) continue;
    let t = m[5];
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).replace(/""/g, '"');
    rows.push({ translation, book, chapter: Number(m[3]), verse: Number(m[4]), text: clean(t) });
  }
  return rows;
}

/** TehShrike/world-english-bible JSON: a list of paragraph pieces with chapterNumber/verseNumber/value */
export function parseWebJson(items: { type: string; chapterNumber?: number; verseNumber?: number; value?: string }[], book: string): Row[] {
  const map = new Map<string, Row>();
  for (const it of items) {
    if (!it.chapterNumber || !it.verseNumber || typeof it.value !== 'string') continue;
    if (!['paragraph text', 'line text'].includes(it.type)) continue;
    const key = `${it.chapterNumber}:${it.verseNumber}`;
    const row = map.get(key) ?? { translation: 'WEB', book, chapter: it.chapterNumber, verse: it.verseNumber, text: '' };
    row.text = clean(`${row.text} ${it.value}`);
    map.set(key, row);
  }
  return [...map.values()];
}

const WEB_FILES: Record<string, string> = Object.fromEntries(
  BOOKS.map((b) => [b.code, b.name.toLowerCase().replace(/ /g, '').replace('songofsongs', 'songofsolomon')]),
);

async function loadBsb(): Promise<Row[]> {
  for (const url of ['https://bereanbible.com/bsb.txt', 'https://berean.bible/downloads/bsb.txt']) {
    const t = await download(url, `bsb-${url.includes('bereanbible') ? 'a' : 'b'}.txt`);
    const rows = t ? parseTabbed(t, 'BSB') : [];
    if (rows.length > 30000) return (console.log(`  BSB from ${url}`), rows);
  }
  const t = await download('https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/BSB.csv', 'bsb-mirror.csv');
  console.log('  BSB from GitHub mirror (scrollmapper/bible_databases)');
  return t ? parseCsv(t, 'BSB') : [];
}

async function loadKjv(): Promise<Row[]> {
  const t = await download('https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/KJV.csv', 'kjv.csv');
  return t ? parseCsv(t, 'KJV') : [];
}

async function loadWeb(): Promise<Row[]> {
  const rows: Row[] = [];
  for (const b of BOOKS) {
    const t = await download(`https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/${WEB_FILES[b.code]}.json`, `web-${b.code}.json`);
    if (t) rows.push(...parseWebJson(JSON.parse(t), b.code));
  }
  return rows;
}

async function main() {
  loadEnv();
  const db = supabaseAdmin();
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  for (const [name, loader] of [['BSB', loadBsb], ['KJV', loadKjv], ['WEB', loadWeb]] as const) {
    if (only.length && !only.includes(name)) continue;
    console.log(`\n${name}: downloading…`);
    const rows = await loader();
    if (rows.length < 30000) {
      console.error(`  Only ${rows.length} verses found for ${name} — skipping (expected about 31,000). Check your internet connection and try again.`);
      continue;
    }
    // de-duplicate (some sources repeat verse numbers in footnotes)
    const unique = [...new Map(rows.map((r) => [`${r.book}.${r.chapter}.${r.verse}`, r])).values()];
    console.log(`  ${unique.length.toLocaleString()} verses. Uploading…`);
    await upsertBatches(db, 'bible_verses', unique, 'translation,book,chapter,verse');
  }
  console.log('\nDone. Bible text loaded.');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
