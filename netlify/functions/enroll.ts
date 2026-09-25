// /api/enroll  POST { courseId } -> start a course (checks prerequisites)
import type { Config } from '@netlify/functions';
import { courseUnlocked } from '../../shared/progress';
import { getCourse } from '../lib/curriculum';
import { handle, HttpError, json, readJson } from '../lib/http';
import { completedCourseIds, ensureEnrollment } from '../lib/progress';
import { requireUser } from '../lib/auth';

export const config: Config = { path: '/api/enroll' };

export default handle(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req);
  const { courseId } = await readJson<{ courseId?: string }>(req);
  const course = getCourse(courseId ?? '');
  if (!user.isAdmin && !courseUnlocked(course, await completedCourseIds(user.id))) {
    throw new HttpError(403, 'Finish the prerequisite courses first.');
  }
  await ensureEnrollment(user.id, course.id);
  return json({ ok: true });
});
