// Runs automatically before `npm run build` / `npm run dev`.
// Writes src/generated/curriculum.json: the curriculum WITHOUT quiz answer keys, for the browser.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PublicCourse } from '../shared/types';
import { loadCourses, validateCourses } from './curriculum-lib';

const list = loadCourses();
const problems = validateCourses(list);
if (problems.length) {
  console.error(`Curriculum has ${problems.length} problem(s). Run "npm run validate:curriculum" for details. First few:\n` + problems.slice(0, 10).join('\n'));
  process.exit(1);
}
const courses: PublicCourse[] = list
  .map(({ course }) => course)
  .sort((a, b) => a.tier - b.tier)
  .map((c) => ({
    ...c,
    lessons: c.lessons.map(({ quiz_bank, ...rest }) => ({ ...rest, quiz_bank_size: quiz_bank.length })),
  }));
const out = path.resolve(import.meta.dirname, '..', 'src', 'generated');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'curriculum.json'), JSON.stringify(courses));
console.log(`Public curriculum written: ${courses.length} courses.`);
