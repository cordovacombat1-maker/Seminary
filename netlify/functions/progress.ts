// /api/progress              -> the signed-in student's lesson progress, enrollments and certificates
// /api/progress?transcript=1 -> also their submitted quiz scores and papers
import type { Config } from '@netlify/functions';
import { requireUser } from '../lib/auth';
import { query } from '../lib/db';
import { handle, json } from '../lib/http';

export const config: Config = { path: '/api/progress' };

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  const [lessons, enrollments, certificates] = await Promise.all([
    query(
      `select lesson_id, course_id, tutor_completed_at, quiz_passed_at, paper_passed_at, completed_at, best_quiz_score, last_activity_at
         from lesson_progress where user_id = $1`,
      [user.id],
    ),
    query('select course_id, started_at, completed_at from enrollments where user_id = $1', [user.id]),
    query('select id, course_id, course_title, student_name, issued_at from certificates where user_id = $1 order by issued_at', [user.id]),
  ]);
  if (!new URL(req.url).searchParams.get('transcript')) return json({ lessons, enrollments, certificates });
  const [quizzes, papers] = await Promise.all([
    query('select lesson_id, score, passed, submitted_at from quiz_attempts where user_id = $1 and submitted_at is not null order by submitted_at', [user.id]),
    query('select lesson_id, title, average, version, graded_at from papers where user_id = $1', [user.id]),
  ]);
  return json({ lessons, enrollments, certificates, quizzes, papers });
});
