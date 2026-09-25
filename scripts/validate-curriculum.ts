// npm run validate:curriculum — checks every course file for mistakes.
import { loadCourses, validateCourses } from './curriculum-lib';

const list = loadCourses();
const problems = validateCourses(list);
const lessons = list.reduce((n, x) => n + x.course.lessons.length, 0);
const questions = list.reduce((n, x) => n + x.course.lessons.reduce((m, l) => m + l.quiz_bank.length, 0), 0);
if (problems.length) {
  console.error(`Found ${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${list.length} courses, ${lessons} lessons, ${questions} quiz-bank questions — all valid.`);
