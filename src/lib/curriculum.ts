import data from '../generated/curriculum.json';
import type { PublicCourse, PublicLesson } from '../../shared/types';
import { TIER_NAMES } from '../../shared/types';

export const COURSES = data as unknown as PublicCourse[];

export const TIERS = Object.entries(TIER_NAMES).map(([n, name]) => ({
  tier: Number(n),
  name,
  courses: COURSES.filter((c) => c.tier === Number(n)),
}));

export function getCourse(id: string | undefined): PublicCourse | undefined {
  return COURSES.find((c) => c.id === id);
}

export function findLesson(lessonId: string | undefined): { course: PublicCourse; lesson: PublicLesson; index: number } | undefined {
  for (const course of COURSES) {
    const index = course.lessons.findIndex((l) => l.id === lessonId);
    if (index >= 0) return { course, lesson: course.lessons[index], index };
  }
  return undefined;
}
