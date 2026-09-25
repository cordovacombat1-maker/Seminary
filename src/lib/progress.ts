import { useCallback, useEffect, useState } from 'react';
import type { LessonProgressRow } from '../../shared/progress';
import { api } from './api';

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

/** Everything about the signed-in student's progress. */
export function useProgress(userId: string | undefined) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api<{ lessons: LessonProgressRow[]; enrollments: { course_id: string; completed_at: string | null }[]; certificates: Certificate[] }>('/api/progress');
      const lp = { data: res.lessons };
      const en = { data: res.enrollments };
      const certs = { data: res.certificates };
      const lessons = new Map(lp.data.map((r) => [r.lesson_id, r]));
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
