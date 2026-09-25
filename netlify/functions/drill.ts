// /api/drill
//   GET  ?lessonId=...                         -> 10 random words for parsing practice (no answers)
//   POST { lessonId, wordId, answers }         -> field-by-field check against the real STEPBible morphology
import type { Config } from '@netlify/functions';
import { checkParsing, FIELD_LABELS, likeToRegex } from '../../shared/morph';
import { BOOK_BY_CODE } from '../../shared/books';
import { findLesson } from '../lib/curriculum';
import { handle, HttpError, json, readJson } from '../lib/http';
import { assertLessonAccess } from '../lib/progress';
import { adminClient, check, requireUser } from '../lib/supabase';

export const config: Config = { path: '/api/drill' };

interface WordRow {
  id: number;
  language: string;
  book: string;
  chapter: number;
  verse: number;
  word: string;
  translit: string | null;
  english: string | null;
  main_strongs: string | null;
  main_morph: string;
  lemma: string | null;
  gloss: string | null;
}

const optionCache = new Map<string, Record<string, string[]>>();

async function fieldOptions(language: string, patterns: string[], fields: string[]): Promise<Record<string, string[]>> {
  const key = `${language}|${patterns.join(',')}|${fields.join(',')}`;
  const hit = optionCache.get(key);
  if (hit) return hit;
  const rows = check(await adminClient().from('morphology_codes').select('code, parsed').eq('language', language).limit(5000)) as {
    code: string;
    parsed: Record<string, string>;
  }[];
  const res = patterns.map(likeToRegex);
  const out: Record<string, string[]> = {};
  for (const f of fields) {
    const values = new Set<string>();
    for (const r of rows) if (res.some((re) => re.test(r.code)) && r.parsed[f]) values.add(r.parsed[f]);
    out[f] = [...values].sort();
  }
  optionCache.set(key, out);
  return out;
}

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  const db = adminClient();

  if (req.method === 'GET') {
    const { course, lesson, index } = findLesson(new URL(req.url).searchParams.get('lessonId') ?? '');
    if (!lesson.drill) throw new HttpError(404, 'This lesson has no parsing drill.');
    await assertLessonAccess(user, course, index);
    const d = lesson.drill;
    const words = check(
      await db.rpc('random_drill_words', { lang: d.language, morph_patterns: d.morph_patterns, books: d.books?.length ? d.books : null, n: 10 }),
    ) as WordRow[];
    if (!words?.length) {
      return json({ items: [], fields: d.fields, options: {}, note: 'No words found. The STEPBible data may not be loaded yet (see the README).' });
    }
    const codes = [...new Set(words.map((w) => w.main_morph))];
    const parsedRows = check(await db.from('morphology_codes').select('code, parsed').in('code', codes)) as { code: string; parsed: Record<string, string> }[];
    const parsedBy = new Map(parsedRows.map((r) => [r.code, r.parsed]));
    const options = await fieldOptions(d.language, d.morph_patterns, d.fields);
    return json({
      instructions: d.instructions,
      language: d.language,
      fields: d.fields.map((f) => ({ key: f, label: FIELD_LABELS[f] ?? f })),
      options,
      items: words.map((w) => ({
        wordId: w.id,
        word: w.word,
        transliteration: w.translit,
        lemma: w.lemma,
        gloss: w.gloss,
        reference: `${BOOK_BY_CODE[w.book]?.name ?? w.book} ${w.chapter}:${w.verse}`,
        // Only ask about fields this word actually has (e.g. no Tense for a noun)
        askFields: d.fields.filter((f) => parsedBy.get(w.main_morph)?.[f]),
      })),
    });
  }

  if (req.method === 'POST') {
    const body = await readJson<{ lessonId?: string; wordId?: number; answers?: Record<string, string> }>(req);
    const { lesson } = findLesson(body.lessonId ?? '');
    if (!lesson.drill) throw new HttpError(404, 'This lesson has no parsing drill.');
    const word = check(await db.from('original_words').select('*').eq('id', Number(body.wordId)).maybeSingle()) as (WordRow & { english: string }) | null;
    if (!word) throw new HttpError(404, 'Word not found.');
    const morph = check(await db.from('morphology_codes').select('code, parsed, summary, explanation').eq('code', word.main_morph).maybeSingle()) as {
      code: string;
      parsed: Record<string, string>;
      summary: string | null;
      explanation: string | null;
    } | null;
    if (!morph) throw new HttpError(404, 'No morphology data for this word.');
    const results = checkParsing(morph.parsed, body.answers ?? {}, lesson.drill.fields);
    return json({
      allCorrect: results.every((r) => r.correct),
      results: results.map((r) => ({ ...r, label: FIELD_LABELS[r.field] ?? r.field })),
      morphologyCode: morph.code,
      fullParsing: morph.parsed,
      summary: morph.summary,
      explanation: morph.explanation,
      english: word.english,
      source: 'STEPBible.org (Tyndale House), CC BY 4.0',
    });
  }

  throw new HttpError(405, 'Method not allowed');
});
