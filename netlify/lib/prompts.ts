// Build the tutor's system prompt from /prompts/*.md and the lesson JSON.
import type Anthropic from '@anthropic-ai/sdk';
import type { Course, Lesson } from '../../shared/types';
import { libraryCatalog } from './biblical';
import { readProjectFile } from './files';

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').trim();

export function homePosition(): string {
  const text = stripComments(readProjectFile('prompts/home-position.md'));
  return text
    ? `The school's statement of faith is below. When a disputed question comes up, you may name this as "the school's position", but you must still present the other views fairly and from their own sources.\n\n${text}`
    : 'The school has not adopted a home position on disputed questions. Present all major views fairly and do not name any as the school\'s position.';
}

/** The lesson as the tutor sees it: everything except the quiz answer keys. */
export function lessonForTutor(lesson: Lesson) {
  const { quiz_bank: _omit, ...rest } = lesson;
  return rest;
}

export function tutorSystemPrompt(course: Course, lesson: Lesson): Anthropic.TextBlockParam[] {
  const template = readProjectFile('prompts/tutor.md');
  const [general, lessonPart] = splitAt(template, '# This lesson');
  const fill = (s: string) =>
    s
      .replaceAll('{{DOCTRINE}}', stripComments(readProjectFile('prompts/doctrine.md')))
      .replaceAll('{{HOME_POSITION}}', homePosition())
      .replaceAll('{{LIBRARY_CATALOG}}', libraryCatalog())
      .replaceAll('{{COURSE_TITLE}}', course.title)
      .replaceAll('{{COURSE_TIER}}', String(course.tier))
      .replaceAll('{{COURSE_TIER_NAME}}', course.tier_name)
      .replaceAll('{{LESSON_JSON}}', JSON.stringify(lessonForTutor(lesson), null, 2));
  // Two cached blocks: the general instructions (same for every lesson) and the lesson itself.
  const blocks: Anthropic.TextBlockParam[] = [{ type: 'text', text: fill(general), cache_control: { type: 'ephemeral' } }];
  if (lessonPart) blocks.push({ type: 'text', text: fill(lessonPart), cache_control: { type: 'ephemeral' } });
  return blocks;
}

function splitAt(s: string, marker: string): [string, string] {
  const i = s.indexOf(marker);
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)];
}
