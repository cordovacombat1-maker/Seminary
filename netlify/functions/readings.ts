// /api/readings?lessonId=...  -> BSB text of the lesson's passages + library excerpts for each assigned reading
import type { Config } from '@netlify/functions';
import { findWork } from '../../shared/library';
import { requireUser } from '../lib/auth';
import { citationFor, keywordSearch, lookupVerse } from '../lib/biblical';
import { findLesson } from '../lib/curriculum';
import { handle, json } from '../lib/http';
import { assertLessonAccess } from '../lib/progress';

export const config: Config = { path: '/api/readings' };

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  const { course, lesson, index } = findLesson(new URL(req.url).searchParams.get('lessonId') ?? '');
  await assertLessonAccess(user, course, index);

  const scripture = await Promise.all(lesson.scripture_passages.map((ref) => lookupVerse(ref, 'BSB', 80)));

  const library = await Promise.all(
    lesson.library_readings.map(async (reading) => {
      const work = findWork(reading.author, reading.title);
      const filter = work ? [work.id, ...work.volumes] : null;
      // Look for the assigned section first, then for the lesson's topic within the work
      let hits = await keywordSearch(`${reading.section} ${lesson.title}`, 3, null, filter);
      if (!hits.length) hits = await keywordSearch(lesson.title, 3, null, filter);
      return {
        reading,
        excerpts: hits.map((h) => ({ id: h.id, citation: citationFor(h), section: h.section_ref, content: h.content, source_url: h.source_url })),
        note: hits.length ? undefined : 'This text has not been loaded into the library yet.',
      };
    }),
  );

  return json({ scripture, library });
});
