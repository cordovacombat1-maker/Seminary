// Server-side progress bookkeeping: access checks, lesson completion, certificates.
import type { Course, Lesson } from '../../shared/types';
import { lessonRequirementsMet, lessonUnlocked, type LessonProgressRow } from '../../shared/progress';
import { allCourses } from './curriculum';
import { HttpError } from './http';
import { adminClient, check, type AuthedUser } from './supabase';

export async function completedCourseIds(userId: string): Promise<Set<string>> {
  const rows = check(
    await adminClient().from('enrollments').select('course_id').eq('user_id', userId).not('completed_at', 'is', null),
  ) as { course_id: string }[];
  return new Set(rows.map((r) => r.course_id));
}

export async function completedLessonIds(userId: string, courseId: string): Promise<Set<string>> {
  const rows = check(
    await adminClient()
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .not('completed_at', 'is', null),
  ) as { lesson_id: string }[];
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
  check(
    await adminClient()
      .from('enrollments')
      .upsert({ user_id: userId, course_id: courseId }, { onConflict: 'user_id,course_id', ignoreDuplicates: true }),
  );
}

export async function getLessonProgress(userId: string, lessonId: string): Promise<(LessonProgressRow & { chat_summary: string; summarized_message_count: number }) | null> {
  const res = await adminClient().from('lesson_progress').select('*').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
  return check(res) as (LessonProgressRow & { chat_summary: string; summarized_message_count: number }) | null;
}

export async function touchLesson(userId: string, courseId: string, lessonId: string, patch: Record<string, unknown> = {}): Promise<void> {
  await ensureEnrollment(userId, courseId);
  check(
    await adminClient()
      .from('lesson_progress')
      .upsert(
        { user_id: userId, course_id: courseId, lesson_id: lessonId, last_activity_at: new Date().toISOString(), ...patch },
        { onConflict: 'user_id,lesson_id' },
      ),
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
  const db = adminClient();
  const row = await getLessonProgress(userId, lesson.id);
  let lessonCompleted = false;
  let courseCompleted = false;
  if (row && !row.completed_at && lessonRequirementsMet(lesson, row)) {
    check(await db.from('lesson_progress').update({ completed_at: new Date().toISOString() }).eq('user_id', userId).eq('lesson_id', lesson.id));
    lessonCompleted = true;
  }
  const done = await completedLessonIds(userId, course.id);
  if (course.lessons.every((l) => done.has(l.id))) {
    const enr = check(
      await db.from('enrollments').select('completed_at').eq('user_id', userId).eq('course_id', course.id).maybeSingle(),
    ) as { completed_at: string | null } | null;
    if (!enr?.completed_at) {
      check(
        await db
          .from('enrollments')
          .upsert({ user_id: userId, course_id: course.id, completed_at: new Date().toISOString() }, { onConflict: 'user_id,course_id' }),
      );
      courseCompleted = true;
    }
    await issueCertificate(userId, course);
  }
  return { lessonCompleted, courseCompleted };
}

export async function issueCertificate(userId: string, course: Course): Promise<void> {
  const db = adminClient();
  const profile = check(await db.from('profiles').select('full_name, email').eq('id', userId).maybeSingle()) as {
    full_name: string;
    email: string;
  } | null;
  const name = profile?.full_name?.trim() || profile?.email || 'Student';
  check(
    await db
      .from('certificates')
      .upsert(
        { user_id: userId, course_id: course.id, student_name: name, course_title: course.title },
        { onConflict: 'user_id,course_id', ignoreDuplicates: true },
      ),
  );
}

export function courseTitle(courseId: string): string {
  return allCourses().find((c) => c.id === courseId)?.title ?? courseId;
}
