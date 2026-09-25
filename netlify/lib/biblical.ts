// Look-ups against the Bible, STEPBible and library tables. Used by the tutor tools,
// the reading pane, and the search page.
import { BOOK_BY_CODE } from '../../shared/books';
import { findWork, WORKS, VOLUME_BY_ID } from '../../shared/library';
import { normalizeStrongs } from '../../shared/morph';
import { formatRange, parseReference, rangeSize, RefError, type PassageRange } from '../../shared/refs';
import type { Tradition } from '../../shared/types';
import { query } from './db';

export const TRANSLATIONS = ['BSB', 'KJV', 'WEB'] as const;

/** SQL condition selecting a (possibly multi-chapter) verse range; parameters start at $<first>. */
export function rangeSql(r: PassageRange, first: number): { sql: string; params: number[] } {
  const p = (n: number) => `$${first + n}`;
  if (r.startChapter === r.endChapter) {
    return { sql: `(chapter = ${p(0)} and verse between ${p(1)} and ${p(2)})`, params: [r.startChapter, r.startVerse, r.endVerse] };
  }
  return {
    sql: `((chapter = ${p(0)} and verse >= ${p(1)}) or (chapter > ${p(0)} and chapter < ${p(2)}) or (chapter = ${p(2)} and verse <= ${p(3)}))`,
    params: [r.startChapter, r.startVerse, r.endChapter, r.endVerse],
  };
}

export interface VerseRow {
  chapter: number;
  verse: number;
  text: string;
}

export async function lookupVerse(reference: string, translation = 'BSB', maxVerses = 60) {
  const t = TRANSLATIONS.includes(translation.toUpperCase() as (typeof TRANSLATIONS)[number]) ? translation.toUpperCase() : 'BSB';
  let range: PassageRange;
  try {
    range = parseReference(reference);
  } catch (e) {
    return { error: e instanceof RefError ? e.message : `Could not read "${reference}"` };
  }
  const truncated = rangeSize(range) > maxVerses;
  const cond = rangeSql(range, 3);
  const rows = await query<VerseRow>(
    `select chapter, verse, text from bible_verses where translation = $1 and book = $2 and ${cond.sql} order by chapter, verse limit ${Number(maxVerses)}`,
    [t, range.book, ...cond.params],
  );
  if (!rows.length) return { reference: formatRange(range), translation: t, verses: [], note: 'No verses found. The Bible text may not be loaded yet.' };
  return {
    reference: formatRange(range),
    translation: t,
    verses: rows.map((r) => ({ ref: `${r.chapter}:${r.verse}`, text: r.text })),
    ...(truncated ? { note: `Showing the first ${maxVerses} verses only.` } : {}),
  };
}

interface WordRow {
  chapter: number;
  verse: number;
  word_num: number;
  word: string;
  translit: string | null;
  english: string | null;
  main_strongs: string | null;
  strongs: string | null;
  grammar: string | null;
  main_morph: string | null;
  lemma: string | null;
  gloss: string | null;
  language: string;
}

export async function lookupOriginal(reference: string, maxVerses = 6) {
  let range: PassageRange;
  try {
    range = parseReference(reference);
  } catch (e) {
    return { error: e instanceof RefError ? e.message : `Could not read "${reference}"` };
  }
  const cond = rangeSql(range, 2);
  const words = await query<WordRow>(
    `select chapter, verse, word_num, word, translit, english, main_strongs, strongs, grammar, main_morph, lemma, gloss, language
       from original_words where book = $1 and ${cond.sql} order by chapter, verse, word_num limit ${Number(maxVerses) * 40}`,
    [range.book, ...cond.params],
  );
  if (!words.length) return { reference: formatRange(range), words: [], note: 'No original-language data found for this reference. The STEPBible data may not be loaded yet.' };
  const strongs = [...new Set(words.map((w) => w.main_strongs).filter(Boolean))] as string[];
  const morphs = [...new Set(words.map((w) => w.main_morph).filter(Boolean))] as string[];
  const [lex, morph] = await Promise.all([
    strongs.length
      ? query<{ strongs: string; lemma: string; translit: string; gloss: string }>('select strongs, lemma, translit, gloss from lexicon where strongs = any($1)', [strongs])
      : [],
    morphs.length ? query<{ code: string; parsed: Record<string, string> }>('select code, parsed from morphology_codes where code = any($1)', [morphs]) : [],
  ]);
  const lexMap = new Map(lex.map((l) => [l.strongs, l]));
  const morphMap = new Map(morph.map((m) => [m.code, m.parsed]));
  const verseKeys = [...new Set(words.map((w) => `${w.chapter}:${w.verse}`))];
  const truncated = verseKeys.length >= maxVerses && rangeSize(range) > maxVerses;
  return {
    reference: formatRange(range),
    language: words[0].language,
    source: 'STEPBible.org (Tyndale House), CC BY 4.0 — TAGNT/TAHOT, TBESG/TBESH, TEGMC/TEHMC',
    words: words.map((w) => {
      const l = w.main_strongs ? lexMap.get(w.main_strongs) : undefined;
      return {
        ref: `${w.chapter}:${w.verse}`,
        word: w.word,
        transliteration: w.translit,
        english: w.english,
        strongs: w.main_strongs,
        lemma: l?.lemma ?? w.lemma,
        gloss: l?.gloss ?? w.gloss,
        morphology_code: w.main_morph ?? w.grammar,
        parsing: (w.main_morph && morphMap.get(w.main_morph)) || null,
      };
    }),
    ...(truncated ? { note: `Showing the first ${maxVerses} verses only.` } : {}),
  };
}

const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();

export async function lexiconEntry(strongsNumber: string) {
  const s = normalizeStrongs(strongsNumber);
  if (!s) return { error: `"${strongsNumber}" is not a Strong's number. Use a form like G0976 or H1254.` };
  const base = s.replace(/[A-Z]$/, '').replace(/^([GH]\d{4}).*$/, '$1');
  const rows = await query<{ strongs: string; language: string; lemma: string; translit: string; morph: string; gloss: string; definition: string }>(
    'select strongs, language, lemma, translit, morph, gloss, definition from lexicon where strongs like $1 limit 6',
    [`${base}%`],
  );
  if (!rows.length) return { strongs: s, entries: [], note: 'No lexicon entry found. The STEPBible lexicons may not be loaded yet.' };
  rows.sort((a, b) => (a.strongs === s ? -1 : b.strongs === s ? 1 : a.strongs.localeCompare(b.strongs)));
  return {
    source: `STEPBible.org ${s.startsWith('G') ? 'TBESG' : 'TBESH'} (Tyndale House), CC BY 4.0`,
    entries: rows.map((r) => ({ ...r, definition: stripHtml(r.definition ?? '').slice(0, 1800) })),
  };
}

export interface LibraryHit {
  id: number;
  work_id: string;
  author: string;
  title: string;
  tradition: string;
  section_ref: string;
  source_url: string;
  content: string;
  similarity: number;
}

export function citationFor(hit: Pick<LibraryHit, 'author' | 'title' | 'section_ref'>): string {
  return [hit.author, hit.title, hit.section_ref].filter(Boolean).join(', ');
}

const TRADITIONS: Tradition[] = ['Patristic', 'Catholic', 'Lutheran', 'Reformed', 'Wesleyan', 'Anabaptist', 'Other'];

/** Keyword search over the library (all words first, then any of them). */
export async function keywordSearch(text: string, count: number, tradition: string | null, workIds: string[] | null): Promise<LibraryHit[]> {
  return query<LibraryHit>('select * from keyword_library_chunks($1, $2, $3, $4)', [text, count, tradition, workIds?.length ? workIds : null]);
}

export async function searchLibrary(
  searchText: string,
  opts: { tradition?: string | null; workIds?: string[] | null; count?: number } = {},
): Promise<{ results: (LibraryHit & { citation: string })[]; method: 'keyword'; note?: string }> {
  const tradition = opts.tradition && TRADITIONS.includes(opts.tradition as Tradition) ? opts.tradition : null;
  const rows = await keywordSearch(searchText, opts.count ?? 6, tradition, opts.workIds ?? null);
  const note = rows.length
    ? undefined
    : 'The library returned nothing for this search. Try different key words (names, distinctive terms), or say plainly that the library does not cover it.';
  return { results: rows.map((r) => ({ ...r, citation: citationFor(r) })), method: 'keyword', ...(note ? { note } : {}) };
}

/** Which work ids / volume ids to search for an assigned reading. */
export function readingFilter(author: string, title: string): string[] | null {
  const work = findWork(author, title);
  if (!work) return null;
  return [work.id, ...work.volumes];
}

/** One-line-per-work catalogue for the tutor's system prompt. */
export function libraryCatalog(): string {
  return WORKS.map((w) => `- ${w.author}, ${w.title} [${w.tradition}] (${w.volumes.map((v) => VOLUME_BY_ID[v]?.label ?? v).join('; ')})`).join('\n');
}

export const bookName = (code: string) => BOOK_BY_CODE[code]?.name ?? code;
