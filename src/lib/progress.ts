import { useCallback, useEffect, useState } from 'react';
import type { LessonProgressRow } from '../../shared/progress';
import { db } from './config';

export interface Certificate {
  id: string;
  course_id: string;
  course_title: string;
  student_name: string;
  issued_at: string;
}

export interface ProgressData {
  lessons: Map<string, LessonProgressRow>;
  completedLessons: Set<string>;
  completedCourses: Set<string>;
  enrolled: Set<string>;
  certificates: Certificate[];
}

/** Everything about the signed-in student's progress (read directly from Supabase; RLS limits it to their rows). */
export function useProgress(userId: string | undefined) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const [lp, en, certs] = await Promise.all([
        db().from('lesson_progress').select('lesson_id, course_id, tutor_completed_at, quiz_passed_at, paper_passed_at, completed_at, best_quiz_score, last_activity_at'),
        db().from('enrollments').select('course_id, completed_at'),
        db().from('certificates').select('id, course_id, course_title, student_name, issued_at'),
      ]);
      if (lp.error || en.error || certs.error) throw new Error('db');
      const lessons = new Map((lp.data as LessonProgressRow[]).map((r) => [r.lesson_id, r]));
      setData({
        lessons,
        completedLessons: new Set([...lessons.values()].filter((r) => r.completed_at).map((r) => r.lesson_id)),
        completedCourses: new Set((en.data as { course_id: string; completed_at: string | null }[]).filter((e) => e.completed_at).map((e) => e.course_id)),
        enrolled: new Set((en.data as { course_id: string }[]).map((e) => e.course_id)),
        certificates: certs.data as Certificate[],
      });
      setError(null);
    } catch {
      setError('We could not load your progress just now. Please refresh the page.');
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
