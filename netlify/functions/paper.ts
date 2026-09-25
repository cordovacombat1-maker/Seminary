// /api/paper
//   GET  ?lessonId=...                        -> the student's paper (draft or graded) and the prompt/rubric
//   PUT  { lessonId, title, content }         -> save draft
//   POST { lessonId, title, content }         -> submit for AI grading against the rubric (revise & resubmit any time)
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Config } from '@netlify/functions';
import { z } from 'zod';
import { PAPER_PASS_AVERAGE, RUBRIC } from '../../shared/types';
import { anthropic } from '../lib/anthropic';
import { findLesson } from '../lib/curriculum';
import { MODELS } from '../lib/env';
import { handle, HttpError, json, readJson } from '../lib/http';
import { lessonForTutor } from '../lib/prompts';
import { assertLessonAccess, refreshCompletion, touchLesson } from '../lib/progress';
import { requireUser } from '../lib/auth';
import { one } from '../lib/db';

export const config: Config = { path: '/api/paper' };

const MIN_WORDS = 150;
const MAX_CHARS = 120_000;

const Grade = z.object({
  thesis: z.number().int().describe('1-5'),
  exegesis: z.number().int().describe('1-5'),
  sources: z.number().int().describe('1-5'),
  reasoning: z.number().int().describe('1-5'),
  clarity: z.number().int().describe('1-5'),
  criterion_comments: z.object({
    thesis: z.string(),
    exegesis: z.string(),
    sources: z.string(),
    reasoning: z.string(),
    clarity: z.string(),
  }),
  overall_feedback: z.string().describe('2-4 paragraphs: main strengths, the most important improvements, and concrete next steps for revision.'),
});

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const { course, lesson, index } = findLesson(url.searchParams.get('lessonId') ?? '');
    if (!lesson.paper_prompt) throw new HttpError(404, 'This lesson has no paper assignment.');
    await assertLessonAccess(user, course, index);
    const paper = await one('select * from papers where user_id = $1 and lesson_id = $2', [user.id, lesson.id]);
    return json({ paper, prompt: lesson.paper_prompt, rubric: RUBRIC, passAverage: PAPER_PASS_AVERAGE, minWords: MIN_WORDS });
  }

  const body = await readJson<{ lessonId?: string; title?: string; content?: string }>(req);
  const { course, lesson, index } = findLesson(body.lessonId ?? '');
  if (!lesson.paper_prompt) throw new HttpError(404, 'This lesson has no paper assignment.');
  await assertLessonAccess(user, course, index);
  const title = (body.title ?? '').trim().slice(0, 300);
  const content = (body.content ?? '').slice(0, MAX_CHARS);
  const existing = await one<{ id: string; version: number; history: unknown[]; status: string }>(
    'select id, version, history, status from papers where user_id = $1 and lesson_id = $2',
    [user.id, lesson.id],
  );

  /** Insert or update this student's paper for the lesson; returns the saved row. */
  const savePaper = (fields: Record<string, unknown>) => {
    const row: Record<string, unknown> = { user_id: user.id, course_id: course.id, lesson_id: lesson.id, title, prompt: lesson.paper_prompt, content, updated_at: new Date().toISOString(), ...fields };
    const cols = Object.keys(row);
    const params = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c]));
    return one(
      `insert into papers (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       on conflict (user_id, lesson_id) do update set ${cols.filter((c) => c !== 'user_id' && c !== 'lesson_id').map((c) => `${c} = excluded.${c}`).join(', ')}
       returning *`,
      params,
    );
  };

  if (req.method === 'PUT') {
    const saved = await savePaper({ status: existing?.status === 'graded' ? 'graded' : 'draft' });
    await touchLesson(user.id, course.id, lesson.id);
    return json({ paper: saved });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) throw new HttpError(400, `Your paper has ${words} words. Please write at least ${MIN_WORDS} words before submitting.`);

  let grade: z.infer<typeof Grade> | null = null;
  try {
    const res = await anthropic().messages.parse({
      model: MODELS.teacher,
      max_tokens: 6000,
      output_config: { format: zodOutputFormat(Grade), effort: 'medium' },
      system: `You are a seminary professor grading a student paper. Grade fairly and specifically against this rubric, scoring each criterion from 1 to 5:
${RUBRIC.map((r) => `- ${r.key} (${r.label}): ${r.description}`).join('\n')}

Scale: 5 = excellent, graduate-level; 4 = good; 3 = satisfactory (passing); 2 = weak; 1 = missing or seriously deficient.
On disputed theological questions, grade the quality of the argument and fairness to other views — never the position the student takes, as long as it is within historic creedal Christianity (Nicene and Apostles' Creeds).
You cannot check quotations against their sources; if a citation looks doubtful, say so gently and ask the student to verify it, but do not accuse. Address the student directly as "you". This program awards certificates of completion, not accredited degrees.`,
      messages: [
        {
          role: 'user',
          content: `LESSON MATERIALS:\n${JSON.stringify(lessonForTutor(lesson))}\n\nASSIGNMENT:\n${lesson.paper_prompt}\n\nSTUDENT PAPER${title ? ` — "${title}"` : ''} (${words} words):\n\n${content}`,
        },
      ],
    });
    grade = res.parsed_output;
  } catch (e) {
    console.error('paper grading failed', e);
  }
  if (!grade) {
    // Save their work so nothing is lost
    await savePaper({ status: existing?.status === 'graded' ? 'graded' : 'draft' });
    throw new HttpError(503, 'The AI grader is temporarily unavailable. Your paper has been saved as a draft — please submit again in a few minutes.');
  }
  const scores = { thesis: clamp(grade.thesis), exegesis: clamp(grade.exegesis), sources: clamp(grade.sources), reasoning: clamp(grade.reasoning), clarity: clamp(grade.clarity) };
  const average = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 5) * 10) / 10;
  const feedback = `${grade.overall_feedback}\n\n${RUBRIC.map((r) => `**${r.label} (${scores[r.key]}/5):** ${grade!.criterion_comments[r.key]}`).join('\n\n')}`;
  const version = (existing?.version ?? 0) + 1;
  const gradedAt = new Date().toISOString();
  const history = [...(existing?.history ?? []), { version, title, content, scores, average, feedback, graded_at: gradedAt }];
  const saved = await savePaper({ status: 'graded', scores, average, feedback, version, history, graded_at: gradedAt });
  const passed = average >= PAPER_PASS_AVERAGE;
  await touchLesson(user.id, course.id, lesson.id, passed ? { paper_passed_at: gradedAt } : {});
  const completion = passed ? await refreshCompletion(user.id, course, lesson) : { lessonCompleted: false, courseCompleted: false };
  return json({ paper: saved, passed, passAverage: PAPER_PASS_AVERAGE, ...completion });
});
