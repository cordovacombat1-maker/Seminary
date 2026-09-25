// /api/quiz
//   POST { action: "start", lessonId }                 -> 10 questions (bank + AI-generated), no answers
//   POST { action: "submit", attemptId, answers }      -> graded results (80% to pass)
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Config } from '@netlify/functions';
import { z } from 'zod';
import { QUIZ_LENGTH, QUIZ_PASS_PERCENT, type Lesson, type QuizQuestion } from '../../shared/types';
import { anthropic } from '../lib/anthropic';
import { findLesson } from '../lib/curriculum';
import { MODELS } from '../lib/env';
import { handle, HttpError, json, readJson } from '../lib/http';
import { lessonForTutor } from '../lib/prompts';
import { assertLessonAccess, getLessonProgress, refreshCompletion, touchLesson } from '../lib/progress';
import { requireUser } from '../lib/auth';
import { one, query } from '../lib/db';

export const config: Config = { path: '/api/quiz' };

const BANK_SHARE = 7; // up to 7 questions from the bank, the rest AI-generated

type StoredQuestion = QuizQuestion & { source: 'bank' | 'ai' };

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const GeneratedQuiz = z.object({
  questions: z.array(
    z.object({
      type: z.enum(['multiple_choice', 'short_answer']),
      question: z.string(),
      options: z.array(z.string()).describe('Exactly 4 options for multiple_choice; empty for short_answer'),
      correct_option_index: z.number().int().describe('0-3 for multiple_choice; -1 for short_answer'),
      answer_key: z.string().describe('For short_answer: what a correct answer must contain. For multiple_choice: a one-sentence explanation.'),
    }),
  ),
});

async function generateQuestions(lesson: Lesson, count: number, avoid: string[]): Promise<StoredQuestion[]> {
  if (count <= 0) return [];
  const res = await anthropic().messages.parse({
    model: MODELS.fast,
    max_tokens: 4000,
    system:
      'You write fair, accurate seminary quiz questions strictly from the lesson materials provided. Never test obscure trivia or anything not supported by the lesson objectives, key terms, scripture passages or readings. Use only well-established facts. Mix recall and understanding.',
    messages: [
      {
        role: 'user',
        content: `Lesson:\n${JSON.stringify(lessonForTutor(lesson))}\n\nWrite ${count} new questions (about two-thirds multiple choice with 4 options, the rest short answer). Do not duplicate these existing questions:\n${avoid.map((q) => `- ${q}`).join('\n')}`,
      },
    ],
    output_config: { format: zodOutputFormat(GeneratedQuiz) },
  });
  const parsed = res.parsed_output;
  if (!parsed) return [];
  const out: StoredQuestion[] = [];
  parsed.questions.slice(0, count).forEach((q, i) => {
    if (q.type === 'multiple_choice' && q.options.length >= 2 && q.correct_option_index >= 0 && q.correct_option_index < q.options.length) {
      out.push({ id: `ai${i + 1}`, type: 'multiple_choice', question: q.question, options: q.options, answer: q.correct_option_index, explanation: q.answer_key, source: 'ai' });
    } else if (q.type === 'short_answer' && q.answer_key) {
      out.push({ id: `ai${i + 1}`, type: 'short_answer', question: q.question, answer_key: q.answer_key, source: 'ai' });
    }
  });
  return out;
}

const ShortAnswerGrades = z.object({
  grades: z.array(
    z.object({
      id: z.string(),
      credit: z.number().describe('1 = correct, 0.5 = partly correct, 0 = incorrect'),
      feedback: z.string().describe('One or two sentences addressed to the student.'),
    }),
  ),
});

async function gradeShortAnswers(items: { id: string; question: string; answer_key: string; response: string }[]) {
  if (!items.length) return new Map<string, { credit: number; feedback: string }>();
  const res = await anthropic().messages.parse({
    model: MODELS.fast,
    max_tokens: 3000,
    system:
      'You grade short answers in a seminary quiz against an answer key. Give full credit (1) when the student captures the substance of the key in their own words, even with different phrasing; 0.5 when partly right; 0 when wrong, missing or off-topic. Ignore spelling. Be fair and encouraging.',
    messages: [{ role: 'user', content: JSON.stringify(items) }],
    output_config: { format: zodOutputFormat(ShortAnswerGrades) },
  });
  const map = new Map<string, { credit: number; feedback: string }>();
  for (const g of res.parsed_output?.grades ?? []) {
    map.set(g.id, { credit: [0, 0.5, 1].includes(g.credit) ? g.credit : g.credit >= 0.75 ? 1 : g.credit >= 0.25 ? 0.5 : 0, feedback: g.feedback });
  }
  return map;
}

export default handle(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req);
  const body = await readJson<{ action?: string; lessonId?: string; attemptId?: string; answers?: Record<string, unknown> }>(req);

  if (body.action === 'start') {
    const { course, lesson, index } = findLesson(body.lessonId ?? '');
    await assertLessonAccess(user, course, index);
    const progress = await getLessonProgress(user.id, lesson.id);
    if (!progress?.tutor_completed_at && !user.isAdmin) {
      throw new HttpError(403, 'The quiz unlocks when you have finished the lesson with the tutor.');
    }
    const fromBank: StoredQuestion[] = shuffle(lesson.quiz_bank)
      .slice(0, Math.min(BANK_SHARE, lesson.quiz_bank.length))
      .map((q) => ({ ...q, source: 'bank' as const }));
    let generated: StoredQuestion[] = [];
    try {
      generated = await generateQuestions(lesson, QUIZ_LENGTH - fromBank.length, lesson.quiz_bank.map((q) => q.question));
    } catch (e) {
      console.error('quiz generation failed; using bank only', e);
    }
    let questions = [...fromBank, ...generated];
    if (questions.length < QUIZ_LENGTH) {
      // fill from the rest of the bank if the AI was unavailable
      const used = new Set(questions.map((q) => q.id));
      questions.push(...lesson.quiz_bank.filter((q) => !used.has(q.id)).map((q) => ({ ...q, source: 'bank' as const })));
    }
    questions = shuffle(questions.slice(0, QUIZ_LENGTH)).map((q, i) => ({ ...q, id: `q${i + 1}` }));
    const attempt = (await one<{ id: string }>(
      'insert into quiz_attempts (user_id, course_id, lesson_id, questions) values ($1, $2, $3, $4) returning id',
      [user.id, course.id, lesson.id, JSON.stringify(questions)],
    ))!;
    return json({
      attemptId: attempt.id,
      passPercent: QUIZ_PASS_PERCENT,
      questions: questions.map((q) => ({ id: q.id, type: q.type, question: q.question, ...(q.type === 'multiple_choice' ? { options: q.options } : {}) })),
    });
  }

  if (body.action === 'submit') {
    const attemptId = String(body.attemptId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) throw new HttpError(404, 'Quiz attempt not found.');
    const attempt = await one<{ id: string; lesson_id: string; questions: StoredQuestion[]; submitted_at: string | null }>(
      'select id, lesson_id, questions, submitted_at from quiz_attempts where id = $1 and user_id = $2',
      [attemptId, user.id],
    );
    if (!attempt) throw new HttpError(404, 'Quiz attempt not found.');
    if (attempt.submitted_at) throw new HttpError(409, 'This quiz was already submitted. Start a new attempt to retake it.');
    const { course, lesson } = findLesson(attempt.lesson_id);
    const answers = body.answers ?? {};

    const shortItems = attempt.questions
      .filter((q): q is StoredQuestion & { type: 'short_answer'; answer_key: string } => q.type === 'short_answer')
      .map((q) => ({ id: q.id, question: q.question, answer_key: q.answer_key, response: String(answers[q.id] ?? '').slice(0, 2000) }));
    const blanks = shortItems.filter((i) => !i.response.trim());
    const toGrade = shortItems.filter((i) => i.response.trim());
    let grades: Map<string, { credit: number; feedback: string }>;
    try {
      grades = await gradeShortAnswers(toGrade);
    } catch (e) {
      console.error('short answer grading failed', e);
      throw new HttpError(503, 'The AI grader is temporarily unavailable, so your short answers could not be graded. Your answers are still on screen — please try submitting again in a minute.');
    }
    for (const b of blanks) grades.set(b.id, { credit: 0, feedback: 'No answer given.' });

    const results = attempt.questions.map((q) => {
      if (q.type === 'multiple_choice') {
        const given = Number(answers[q.id]);
        const correct = given === q.answer;
        return { id: q.id, credit: correct ? 1 : 0, correct, given: Number.isFinite(given) ? given : null, answer: q.answer, explanation: q.explanation ?? '' };
      }
      const g = grades.get(q.id) ?? { credit: 0, feedback: 'Could not be graded.' };
      return { id: q.id, credit: g.credit, correct: g.credit === 1, given: String(answers[q.id] ?? ''), answer_key: q.answer_key, feedback: g.feedback };
    });
    const score = Math.round((results.reduce((s, r) => s + r.credit, 0) / attempt.questions.length) * 1000) / 10;
    const passed = score >= QUIZ_PASS_PERCENT;
    const updated = await query(
      'update quiz_attempts set answers = $1, results = $2, score = $3, passed = $4, submitted_at = now() where id = $5 and user_id = $6 and submitted_at is null returning id',
      [JSON.stringify(answers), JSON.stringify(results), score, passed, attempt.id, user.id],
    );
    if (!updated.length) throw new HttpError(409, 'This quiz was already submitted. Start a new attempt to retake it.');
    const progress = await getLessonProgress(user.id, lesson.id);
    const best = Math.max(score, Number(progress?.best_quiz_score ?? 0));
    await touchLesson(user.id, course.id, lesson.id, {
      best_quiz_score: best,
      ...(passed && !progress?.quiz_passed_at ? { quiz_passed_at: new Date().toISOString() } : {}),
    });
    const completion = passed ? await refreshCompletion(user.id, course, lesson) : { lessonCompleted: false, courseCompleted: false };
    return json({ score, passed, passPercent: QUIZ_PASS_PERCENT, results, questions: attempt.questions, ...completion });
  }

  throw new HttpError(400, 'Unknown quiz action.');
});
