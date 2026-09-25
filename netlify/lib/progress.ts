// Server-side progress bookkeeping: access checks, lesson completion, certificates.
import type { Course, Lesson } from '../../shared/types';
import { lessonRequirementsMet, lessonUnlocked, type LessonProgressRow } from '../../shared/progress';
import type { AuthedUser } from './auth';
import { allCourses } from './curriculum';
import { one, query } from './db';
import { HttpError } from './http';

export async function completedCourseIds(userId: string): Promise<Set<string>> {
  const rows = await query<{ course_id: string }>('select course_id from enrollments where user_id = $1 and completed_at is not null', [userId]);
  return new Set(rows.map((r) => r.course_id));
}

export async function completedLessonIds(userId: string, courseId: string): Promise<Set<string>> {
  const rows = await query<{ lesson_id: string }>(
    'select lesson_id from lesson_progress where user_id = $1 and course_id = $2 and completed_at is not null',
    [userId, courseId],
  );
  return new Set(rows.map((r) => r.lesson_id));
}

export async function assertLessonAccess(user: AuthedUser, course: Course, index: number): Promise<void> {
  if (user.isAdmin) return;
  const [courses, lessons] = await Promise.all([completedCourseIds(user.id), completedLessonIds(user.id, course.id)]);
  if (!lessonUnlocked(course, index, courses, lessons)) {
    throw new HttpError(403, 'This lesson is still locked. Finish the earlier lessons (and any prerequisite courses) first.');
  }
}

export async function ensureEnrollment(userId: string, courseId: string): Promise<void> {
  await query('insert into enrollments (user_id, course_id) values ($1, $2) on conflict do nothing', [userId, courseId]);
}

export type FullProgressRow = LessonProgressRow & { chat_summary: string; summarized_message_count: number };

export async function getLessonProgress(userId: string, lessonId: string): Promise<FullProgressRow | null> {
  const row = await one<FullProgressRow>('select * from lesson_progress where user_id = $1 and lesson_id = $2', [userId, lessonId]);
  return row ? { ...row, best_quiz_score: row.best_quiz_score === null ? null : Number(row.best_quiz_score) } : null;
}

const PATCHABLE = new Set(['tutor_completed_at', 'quiz_passed_at', 'best_quiz_score', 'paper_passed_at', 'completed_at', 'chat_summary', 'summarized_message_count']);

export async function touchLesson(userId: string, courseId: string, lessonId: string, patch: Record<string, unknown> = {}): Promise<void> {
  await ensureEnrollment(userId, courseId);
  const keys = Object.keys(patch).filter((k) => PATCHABLE.has(k));
  const cols = ['user_id', 'course_id', 'lesson_id', 'last_activity_at', ...keys];
  const params = [userId, courseId, lessonId, new Date().toISOString(), ...keys.map((k) => patch[k])];
  const updates = ['last_activity_at', ...keys].map((k) => `${k} = excluded.${k}`).join(', ');
  await query(
    `insert into lesson_progress (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     on conflict (user_id, lesson_id) do update set ${updates}`,
    params,
  );
}

/**
 * After a tutor/quiz/paper milestone: mark the lesson complete if every requirement is met,
 * then mark the course complete and issue the certificate if every lesson is done.
 * Returns what changed so the UI can celebrate.
 */
export async function refreshCompletion(
  userId: string,
  course: Course,
  lesson: Lesson,
): Promise<{ lessonCompleted: boolean; courseCompleted: boolean }> {
  const row = await getLessonProgress(userId, lesson.id);
  let lessonCompleted = false;
  let courseCompleted = false;
  if (row && !row.completed_at && lessonRequirementsMet(lesson, row)) {
    await query('update lesson_progress set completed_at = now() where user_id = $1 and lesson_id = $2', [userId, lesson.id]);
    lessonCompleted = true;
  }
  const done = await completedLessonIds(userId, course.id);
  if (course.lessons.every((l) => done.has(l.id))) {
    const updated = await query(
      `insert into enrollments (user_id, course_id, completed_at) values ($1, $2, now())
       on conflict (user_id, course_id) do update set completed_at = now() where enrollments.completed_at is null
       returning course_id`,
      [userId, course.id],
    );
    courseCompleted = updated.length > 0;
    await issueCertificate(userId, course);
  }
  return { lessonCompleted, courseCompleted };
}

export async function issueCertificate(userId: string, course: Course): Promise<void> {
  const u = await one<{ full_name: string; email: string }>('select full_name, email from users where id = $1', [userId]);
  const name = u?.full_name?.trim() || u?.email || 'Student';
  await query(
    `insert into certificates (user_id, course_id, student_name, course_title) values ($1, $2, $3, $4)
     on conflict (user_id, course_id) do nothing`,
    [userId, course.id, name, course.title],
  );
}

export function courseTitle(courseId: string): string {
  return allCourses().find((c) => c.id === courseId)?.title ?? courseId;
}
