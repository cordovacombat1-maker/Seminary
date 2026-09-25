// Shared helpers for reading and checking the curriculum files.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findWork, VOLUME_BY_ID } from '../shared/library';
import { GREEK_FIELDS, HEBREW_FIELDS } from '../shared/morph';
import { parseReference } from '../shared/refs';
import type { Course } from '../shared/types';

export const CURRICULUM_DIR = path.resolve(import.meta.dirname, '..', 'curriculum');

export function loadCourses(): { file: string; course: Course }[] {
  return readdirSync(CURRICULUM_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, course: JSON.parse(readFileSync(path.join(CURRICULUM_DIR, file), 'utf8')) as Course }));
}

/** Returns a list of human-readable problems (empty = all good). */
export function validateCourses(list: { file: string; course: Course }[]): string[] {
  const problems: string[] = [];
  const ids = new Set(list.map((x) => x.course.id));
  const lessonIds = new Set<string>();
  for (const { file, course } of list) {
    const where = (s: string) => `${file}: ${s}`;
    for (const k of ['id', 'title', 'tier', 'tier_name', 'description', 'prerequisites', 'lessons'] as const) {
      if (course[k] === undefined) problems.push(where(`missing "${k}"`));
    }
    for (const p of course.prerequisites ?? []) if (!ids.has(p)) problems.push(where(`prerequisite "${p}" is not a course id`));
    if (!course.lessons?.length) problems.push(where('has no lessons'));
    const expected = course.id === 'thesis' ? null : 12;
    if (expected && course.lessons?.length !== expected) problems.push(where(`has ${course.lessons?.length} lessons (expected ${expected})`));
    for (const lesson of course.lessons ?? []) {
      const lw = (s: string) => where(`lesson "${lesson.id}": ${s}`);
      if (lessonIds.has(lesson.id)) problems.push(lw('duplicate lesson id'));
      lessonIds.add(lesson.id);
      if (!lesson.title) problems.push(lw('missing title'));
      if (!lesson.objectives?.length) problems.push(lw('no objectives'));
      const oids = new Set<string>();
      for (const o of lesson.objectives ?? []) {
        if (!o.id || !o.text) problems.push(lw('objective missing id or text'));
        if (oids.has(o.id)) problems.push(lw(`duplicate objective id ${o.id}`));
        oids.add(o.id);
      }
      if (!lesson.scripture_passages?.length) problems.push(lw('no scripture passages'));
      for (const ref of lesson.scripture_passages ?? []) {
        try {
          parseReference(ref);
        } catch (e) {
          problems.push(lw(`bad scripture reference: ${(e as Error).message}`));
        }
      }
      if (!lesson.library_readings?.length) problems.push(lw('no library readings'));
      for (const r of lesson.library_readings ?? []) {
        const work = findWork(r.author, r.title);
        if (!work) problems.push(lw(`reading "${r.author}, ${r.title}" is not in the library catalogue (shared/library.ts)`));
        else if (work.volumes.every((v) => VOLUME_BY_ID[v]?.priority !== 'core')) problems.push(lw(`reading "${r.author}, ${r.title}" is not in a core library volume`));
        if (!r.section) problems.push(lw(`reading "${r.title}" has no section`));
      }
      if (!lesson.key_terms?.length) problems.push(lw('no key terms'));
      if (!lesson.discussion_questions?.length) problems.push(lw('no discussion questions'));
      if ((lesson.quiz_bank?.length ?? 0) < 5) problems.push(lw(`quiz bank has ${lesson.quiz_bank?.length ?? 0} questions (need at least 5)`));
      const qids = new Set<string>();
      for (const q of lesson.quiz_bank ?? []) {
        if (qids.has(q.id)) problems.push(lw(`duplicate quiz id ${q.id}`));
        qids.add(q.id);
        if (q.type === 'multiple_choice') {
          if (!Array.isArray(q.options) || q.options.length < 3) problems.push(lw(`quiz ${q.id}: needs 3+ options`));
          if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.length ?? 0)) problems.push(lw(`quiz ${q.id}: answer index out of range`));
        } else if (q.type === 'short_answer') {
          if (!q.answer_key) problems.push(lw(`quiz ${q.id}: missing answer_key`));
        } else problems.push(lw(`quiz ${(q as { id: string }).id}: unknown type`));
      }
      if (!(lesson.quiz_bank ?? []).some((q) => q.type === 'short_answer')) problems.push(lw('quiz bank has no short-answer question'));
      if (lesson.supplementary_viewing && !/^https:\/\/(www\.)?thirdmill\.org\//.test(lesson.supplementary_viewing))
        problems.push(lw('supplementary_viewing must be a https://thirdmill.org/ link'));
      if (lesson.drill) {
        const allowed: readonly string[] = lesson.drill.language === 'greek' ? GREEK_FIELDS : HEBREW_FIELDS;
        for (const f of lesson.drill.fields) if (!allowed.includes(f)) problems.push(lw(`drill field "${f}" is not valid for ${lesson.drill.language}`));
        if (!lesson.drill.morph_patterns?.length) problems.push(lw('drill has no morph_patterns'));
      }
    }
  }
  return problems;
}
