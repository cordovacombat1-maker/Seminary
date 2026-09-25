// Look-ups against the Bible, STEPBible and library tables. Used by the tutor tools,
// the reading pane, and the search page.
import type { SupabaseClient } from '@supabase/supabase-js';
import { BOOK_BY_CODE } from '../../shared/books';
import { findWork, WORKS, VOLUME_BY_ID } from '../../shared/library';
import { normalizeStrongs } from '../../shared/morph';
import { formatRange, parseReference, rangeSize, RefError, type PassageRange } from '../../shared/refs';
import type { Tradition } from '../../shared/types';
import { embed } from './voyage';

export const TRANSLATIONS = ['BSB', 'KJV', 'WEB'] as const;

/** PostgREST "or" filter selecting a (possibly multi-chapter) verse range. */
export function rangeFilter(r: PassageRange): string {
  if (r.startChapter === r.endChapter) {
    return `and(chapter.eq.${r.startChapter},verse.gte.${r.startVerse},verse.lte.${r.endVerse})`;
  }
  const parts = [`and(chapter.eq.${r.startChapter},verse.gte.${r.startVerse})`, `and(chapter.eq.${r.endChapter},verse.lte.${r.endVerse})`];
  if (r.endChapter - r.startChapter > 1) parts.push(`and(chapter.gt.${r.startChapter},chapter.lt.${r.endChapter})`);
  return parts.join(',');
}

export interface VerseRow {
  chapter: number;
  verse: number;
  text: string;
}

export async function lookupVerse(db: SupabaseClient, reference: string, translation = 'BSB', maxVerses = 60) {
  const t = TRANSLATIONS.includes(translation.toUpperCase() as (typeof TRANSLATIONS)[number]) ? translation.toUpperCase() : 'BSB';
  let range: PassageRange;
  try {
    range = parseReference(reference);
  } catch (e) {
    return { error: e instanceof RefError ? e.message : `Could not read "${reference}"` };
  }
  const truncated = rangeSize(range) > maxVerses;
  const { data, error } = await db
    .from('bible_verses')
    .select('chapter, verse, text')
    .eq('translation', t)
    .eq('book', range.book)
    .or(rangeFilter(range))
    .order('chapter')
    .order('verse')
    .limit(maxVerses);
  if (error) throw new Error(`bible_verses: ${error.message}`);
  const rows = (data ?? []) as VerseRow[];
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

export async function lookupOriginal(db: SupabaseClient, reference: string, maxVerses = 6) {
  let range: PassageRange;
  try {
    range = parseReference(reference);
  } catch (e) {
    return { error: e instanceof RefError ? e.message : `Could not read "${reference}"` };
  }
  const { data, error } = await db
    .from('original_words')
    .select('chapter, verse, word_num, word, translit, english, main_strongs, strongs, grammar, main_morph, lemma, gloss, language')
    .eq('book', range.book)
    .or(rangeFilter(range))
    .order('chapter')
    .order('verse')
    .order('word_num')
    .limit(maxVerses * 40);
  if (error) throw new Error(`original_words: ${error.message}`);
  const words = (data ?? []) as WordRow[];
  if (!words.length) return { reference: formatRange(range), words: [], note: 'No original-language data found for this reference. The STEPBible data may not be loaded yet.' };
  const strongs = [...new Set(words.map((w) => w.main_strongs).filter(Boolean))] as string[];
  const morphs = [...new Set(words.map((w) => w.main_morph).filter(Boolean))] as string[];
  const [lex, morph] = await Promise.all([
    strongs.length ? db.from('lexicon').select('strongs, lemma, translit, gloss').in('strongs', strongs) : Promise.resolve({ data: [], error: null }),
    morphs.length ? db.from('morphology_codes').select('code, parsed').in('code', morphs) : Promise.resolve({ data: [], error: null }),
  ]);
  const lexMap = new Map(((lex.data ?? []) as { strongs: string; lemma: string; translit: string; gloss: string }[]).map((l) => [l.strongs, l]));
  const morphMap = new Map(((morph.data ?? []) as { code: string; parsed: Record<string, string> }[]).map((m) => [m.code, m.parsed]));
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

export async function lexiconEntry(db: SupabaseClient, strongsNumber: string) {
  const s = normalizeStrongs(strongsNumber);
  if (!s) return { error: `"${strongsNumber}" is not a Strong's number. Use a form like G0976 or H1254.` };
  const base = s.replace(/[A-Z]$/, '').replace(/^([GH]\d{4}).*$/, '$1');
  const { data, error } = await db
    .from('lexicon')
    .select('strongs, language, lemma, translit, morph, gloss, definition')
    .like('strongs', `${base}%`)
    .limit(6);
  if (error) throw new Error(`lexicon: ${error.message}`);
  const rows = (data ?? []) as { strongs: string; language: string; lemma: string; translit: string; morph: string; gloss: string; definition: string }[];
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

export async function searchLibrary(
  db: SupabaseClient,
  query: string,
  opts: { tradition?: string | null; workIds?: string[] | null; count?: number } = {},
): Promise<{ results: (LibraryHit & { citation: string })[]; method: 'vector' | 'keyword'; note?: string }> {
  const tradition = opts.tradition && TRADITIONS.includes(opts.tradition as Tradition) ? opts.tradition : null;
  const count = opts.count ?? 6;
  let method: 'vector' | 'keyword' = 'vector';
  let rows: LibraryHit[] = [];
  let note: string | undefined;
  try {
    const [vec] = await embed([query], 'query');
    const { data, error } = await db.rpc('match_library_chunks', {
      query_embedding: JSON.stringify(vec),
      match_count: count,
      tradition_filter: tradition,
      work_filter: opts.workIds?.length ? opts.workIds : null,
    });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as LibraryHit[];
  } catch (e) {
    console.warn('vector search unavailable, using keyword search:', (e as Error).message);
    method = 'keyword';
    const { data, error } = await db.rpc('keyword_library_chunks', {
      query_text: query,
      match_count: count,
      tradition_filter: tradition,
      work_filter: opts.workIds?.length ? opts.workIds : null,
    });
    if (error) throw new Error(`library search: ${error.message}`);
    rows = (data ?? []) as LibraryHit[];
  }
  if (!rows.length) note = 'The library returned nothing for this query. Say plainly that the library does not cover it.';
  return { results: rows.map((r) => ({ ...r, citation: citationFor(r) })), method, ...(note ? { note } : {}) };
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
