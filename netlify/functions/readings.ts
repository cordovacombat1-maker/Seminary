// /api/readings?lessonId=...  -> BSB text of the lesson's passages + library excerpts for each assigned reading
import type { Config } from '@netlify/functions';
import { findWork } from '../../shared/library';
import { citationFor, lookupVerse, type LibraryHit } from '../lib/biblical';
import { findLesson } from '../lib/curriculum';
import { handle, json } from '../lib/http';
import { assertLessonAccess } from '../lib/progress';
import { adminClient, requireUser } from '../lib/supabase';
import { embed } from '../lib/voyage';

export const config: Config = { path: '/api/readings' };

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  const db = adminClient();
  const { course, lesson, index } = findLesson(new URL(req.url).searchParams.get('lessonId') ?? '');
  await assertLessonAccess(user, course, index);

  const scripture = await Promise.all(lesson.scripture_passages.map((ref) => lookupVerse(db, ref, 'BSB', 80)));

  const queries = lesson.library_readings.map((r) => `${r.author}, ${r.title}, ${r.section}. ${lesson.title}`);
  let vectors: number[][] | null = null;
  try {
    vectors = queries.length ? await embed(queries, 'query') : [];
  } catch (e) {
    console.warn('embedding unavailable for readings; falling back to keyword search', (e as Error).message);
  }

  const library = await Promise.all(
    lesson.library_readings.map(async (reading, i) => {
      const work = findWork(reading.author, reading.title);
      const filter = work ? [work.id, ...work.volumes] : null;
      let hits: LibraryHit[] = [];
      if (vectors) {
        const { data } = await db.rpc('match_library_chunks', { query_embedding: JSON.stringify(vectors[i]), match_count: 3, tradition_filter: null, work_filter: filter });
        hits = (data ?? []) as LibraryHit[];
      }
      if (!hits.length) {
        const { data } = await db.rpc('keyword_library_chunks', { query_text: `${reading.section} ${lesson.title}`, match_count: 3, tradition_filter: null, work_filter: filter });
        hits = (data ?? []) as LibraryHit[];
      }
      return {
        reading,
        excerpts: hits.map((h) => ({ id: h.id, citation: citationFor(h), section: h.section_ref, content: h.content, source_url: h.source_url })),
        note: hits.length ? undefined : 'This text has not been loaded into the library yet.',
      };
    }),
  );

  return json({ scripture, library });
});
