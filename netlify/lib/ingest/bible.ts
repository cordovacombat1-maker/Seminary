// Three public-domain English Bibles, verse by verse, for the bible_verses table:
//   BSB — Berean Standard Bible (public domain since April 30, 2023) — from bereanbible.com
//   KJV — King James Version (public domain)
//   WEB — World English Bible (public domain)
// If an official site is unreachable, a GitHub mirror of the same public-domain text is used.
import { BOOKS, findBook } from '../../../shared/books';
import { download } from './fetch';

export type BibleRow = { translation: string; book: string; chapter: number; verse: number; text: string };

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^"|"$/g, '').trim();

/** "Genesis 1:1<TAB>In the beginning…" (the format of bereanbible.com/bsb.txt) */
export function parseTabbed(text: string, translation: string): BibleRow[] {
  const rows: BibleRow[] = [];
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
export function parseCsv(text: string, translation: string): BibleRow[] {
  const rows: BibleRow[] = [];
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
export function parseWebJson(items: { type: string; chapterNumber?: number; verseNumber?: number; value?: string }[], book: string): BibleRow[] {
  const map = new Map<string, BibleRow>();
  for (const it of items) {
    if (!it.chapterNumber || !it.verseNumber || typeof it.value !== 'string') continue;
    if (!['paragraph text', 'line text'].includes(it.type)) continue;
    const key = `${it.chapterNumber}:${it.verseNumber}`;
    const row: BibleRow = map.get(key) ?? { translation: 'WEB', book, chapter: it.chapterNumber, verse: it.verseNumber, text: '' };
    row.text = clean(`${row.text} ${it.value}`);
    map.set(key, row);
  }
  return [...map.values()];
}

const WEB_FILES: Record<string, string> = Object.fromEntries(
  BOOKS.map((b) => [b.code, b.name.toLowerCase().replace(/ /g, '').replace('songofsongs', 'songofsolomon')]),
);

export async function loadBsb(): Promise<BibleRow[]> {
  for (const url of ['https://bereanbible.com/bsb.txt', 'https://berean.bible/downloads/bsb.txt']) {
    const t = await download(url, `bsb-${url.includes('bereanbible') ? 'a' : 'b'}.txt`);
    const rows = t ? parseTabbed(t, 'BSB') : [];
    if (rows.length > 30000) return rows;
  }
  const t = await download('https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/BSB.csv', 'bsb-mirror.csv');
  return t ? parseCsv(t, 'BSB') : [];
}

export async function loadKjv(): Promise<BibleRow[]> {
  const t = await download('https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/KJV.csv', 'kjv.csv');
  return t ? parseCsv(t, 'KJV') : [];
}

export async function loadWeb(): Promise<BibleRow[]> {
  const rows: BibleRow[] = [];
  // 66 small files; fetch 11 at a time
  for (let i = 0; i < BOOKS.length; i += 11) {
    const texts = await Promise.all(
      BOOKS.slice(i, i + 11).map((b) => download(`https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/${WEB_FILES[b.code]}.json`, `web-${b.code}.json`)),
    );
    texts.forEach((t, j) => t && rows.push(...parseWebJson(JSON.parse(t), BOOKS[i + j].code)));
  }
  return rows;
}

/** De-duplicate (some sources repeat verse numbers in footnotes). */
export const uniqueVerses = (rows: BibleRow[]) => [...new Map(rows.map((r) => [`${r.book}.${r.chapter}.${r.verse}`, r])).values()];
