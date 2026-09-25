// Load the curriculum JSON files (with answer keys — server only).
import type { Course, Lesson } from '../../shared/types';
import { listProjectDir, readProjectFile } from './files';
import { HttpError } from './http';

let cache: Course[] | null = null;

export function allCourses(): Course[] {
  if (!cache) {
    cache = listProjectDir('curriculum')
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readProjectFile(`curriculum/${f}`)) as Course);
  }
  return cache;
}

export function getCourse(courseId: string): Course {
  const c = allCourses().find((x) => x.id === courseId);
  if (!c) throw new HttpError(404, 'That course does not exist.');
  return c;
}

export function findLesson(lessonId: string): { course: Course; lesson: Lesson; index: number } {
  for (const course of allCourses()) {
    const index = course.lessons.findIndex((l) => l.id === lessonId);
    if (index >= 0) return { course, lesson: course.lessons[index], index };
  }
  throw new HttpError(404, 'That lesson does not exist.');
}
