// Rules for unlocking and completing lessons and courses (used by both server and browser).
import type { Course, Lesson, PublicCourse, PublicLesson } from './types';

export interface LessonProgressRow {
  lesson_id: string;
  course_id: string;
  tutor_completed_at: string | null;
  quiz_passed_at: string | null;
  paper_passed_at: string | null;
  completed_at: string | null;
  best_quiz_score: number | null;
  last_activity_at: string;
}

export function lessonRequirementsMet(lesson: Lesson | PublicLesson, row: Partial<LessonProgressRow> | undefined): boolean {
  if (!row) return false;
  if (!row.tutor_completed_at || !row.quiz_passed_at) return false;
  if (lesson.paper_prompt && !row.paper_passed_at) return false;
  return true;
}

export function courseUnlocked(course: Course | PublicCourse, completedCourseIds: Set<string>): boolean {
  return course.prerequisites.every((p) => completedCourseIds.has(p));
}

/** A lesson is open when the course is unlocked and the previous lesson is complete. */
export function lessonUnlocked(
  course: Course | PublicCourse,
  lessonIndex: number,
  completedCourseIds: Set<string>,
  completedLessonIds: Set<string>,
): boolean {
  if (!courseUnlocked(course, completedCourseIds)) return false;
  if (lessonIndex === 0) return true;
  return completedLessonIds.has(course.lessons[lessonIndex - 1].id);
}
