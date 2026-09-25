// /api/tutor
//   GET  ?lessonId=...          -> saved chat history + objective progress for the lesson
//   POST { lessonId, message }  -> streams the tutor's reply as newline-delimited JSON events
//   POST { lessonId, start: true } -> tutor opens the lesson (first visit)
import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '@netlify/functions';
import { anthropic } from '../lib/anthropic';
import { buildWindow, loadThread, needsSummary, updateSummary, userMessagesToday } from '../lib/chat';
import { findLesson } from '../lib/curriculum';
import { dailyMessageLimit, MODELS } from '../lib/env';
import { friendlyMessage, handle, HttpError, json, readJson } from '../lib/http';
import { assertLessonAccess, getLessonProgress, refreshCompletion, touchLesson } from '../lib/progress';
import { tutorSystemPrompt } from '../lib/prompts';
import { requireUser } from '../lib/auth';
import { one, query } from '../lib/db';
import { runTool, TUTOR_TOOLS } from '../lib/tutor-tools';

export const config: Config = { path: '/api/tutor' };

const MAX_TOOL_ROUNDS = 8;
const MAX_MESSAGE_CHARS = 6000;

const STATUS: Record<string, (i: Record<string, unknown>) => string> = {
  lookup_verse: (i) => `Reading ${i.reference ?? 'Scripture'}…`,
  lookup_original: (i) => `Checking the Greek/Hebrew of ${i.reference ?? 'the passage'}…`,
  lexicon: (i) => `Looking up ${i.strongs_number ?? 'a word'} in the lexicon…`,
  search_library: (i) => `Searching the library for "${String(i.query ?? '').slice(0, 60)}"…`,
  mark_objective_complete: () => 'Recording your progress…',
};

export default handle(async (req: Request) => {
  const user = await requireUser(req);

  if (req.method === 'GET') {
    const lessonId = new URL(req.url).searchParams.get('lessonId') ?? '';
    const { course, index } = findLesson(lessonId);
    await assertLessonAccess(user, course, index);
    const [thread, objectives, progress, usedToday] = await Promise.all([
      loadThread(user.id, lessonId),
      query<{ objective_id: string }>('select objective_id from objective_progress where user_id = $1 and lesson_id = $2', [user.id, lessonId]),
      getLessonProgress(user.id, lessonId),
      userMessagesToday(user.id),
    ]);
    return json({
      messages: thread,
      completedObjectives: objectives.map((o) => o.objective_id),
      progress,
      dailyLimit: dailyMessageLimit(),
      usedToday,
    });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const body = await readJson<{ lessonId?: string; message?: string; start?: boolean }>(req);
  const { course, lesson, index } = findLesson(body.lessonId ?? '');
  await assertLessonAccess(user, course, index);

  const text = (body.message ?? '').trim();
  if (!body.start && !text) throw new HttpError(400, 'Please type a message.');
  if (text.length > MAX_MESSAGE_CHARS) throw new HttpError(400, `Please keep messages under ${MAX_MESSAGE_CHARS} characters.`);

  const limit = dailyMessageLimit();
  if (!body.start && !user.isAdmin && (await userMessagesToday(user.id)) >= limit) {
    throw new HttpError(429, `You've reached today's limit of ${limit} tutor messages. Your progress is saved — come back tomorrow to continue.`);
  }

  await touchLesson(user.id, course.id, lesson.id);
  let thread = await loadThread(user.id, lesson.id);
  if (body.start && thread.length) return json({ alreadyStarted: true });

  let userMessageId: number | null = null;
  if (!body.start) {
    const inserted = (await one<{ id: number }>(
      "insert into chat_messages (user_id, lesson_id, role, content) values ($1, $2, 'user', $3) returning id",
      [user.id, lesson.id, text],
    ))!;
    userMessageId = inserted.id;
    thread = [...thread, { id: inserted.id, role: 'user', content: text, created_at: new Date().toISOString() }];
  }

  const progress = await getLessonProgress(user.id, lesson.id);
  const doneRows = await query<{ objective_id: string }>('select objective_id from objective_progress where user_id = $1 and lesson_id = $2', [
    user.id,
    lesson.id,
  ]);
  const completed = new Set(doneRows.map((r) => r.objective_id));

  const progressBlock = () => {
    const lines = lesson.objectives.map((o) => `- [${completed.has(o.id) ? 'x' : ' '}] ${o.id}: ${o.text}`);
    let s = `# Current progress\n\nObjectives (x = already complete):\n${lines.join('\n')}`;
    if (completed.size === lesson.objectives.length) s += '\n\nAll objectives are complete. The quiz is unlocked. Continue to answer questions and review as the student wishes.';
    if (progress?.chat_summary) s += `\n\n# Summary of earlier conversation (older messages are not shown)\n\n${progress.chat_summary}`;
    if (body.start) s += '\n\nThe student has just opened this lesson for the first time. Greet them and begin.';
    return s;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      let fullText = '';
      try {
        const system = [...tutorSystemPrompt(course, lesson), { type: 'text' as const, text: progressBlock() }];
        const messages: Anthropic.MessageParam[] = buildWindow(thread);
        let lessonJustCompleted = false;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (round > 0 && fullText && !fullText.endsWith('\n')) {
            fullText += '\n\n';
            send({ t: 'text', v: '\n\n' });
          }
          const s = anthropic().messages.stream({
            model: MODELS.teacher,
            max_tokens: 8000,
            output_config: { effort: 'medium' },
            system: round === 0 ? system : [...system.slice(0, -1), { type: 'text', text: progressBlock() }],
            tools: TUTOR_TOOLS,
            messages,
          });
          s.on('text', (delta) => {
            fullText += delta;
            send({ t: 'text', v: delta });
          });
          const msg = await s.finalMessage();
          if (msg.stop_reason === 'refusal') {
            const note = '\n\nI’m not able to continue with that request. Let’s return to the lesson.';
            fullText += note;
            send({ t: 'text', v: note });
            break;
          }
          const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          if (msg.stop_reason !== 'tool_use' || !toolUses.length) break;

          messages.push({ role: 'assistant', content: msg.content });
          const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolUses.map(async (tu) => {
              send({ t: 'status', v: STATUS[tu.name]?.((tu.input ?? {}) as Record<string, unknown>) ?? 'Working…' });
              const out = await runTool(tu.name, tu.input, {
                lesson,
                markObjective: async (objectiveId) => {
                  await query('insert into objective_progress (user_id, lesson_id, objective_id) values ($1, $2, $3) on conflict do nothing', [
                    user.id,
                    lesson.id,
                    objectiveId,
                  ]);
                  completed.add(objectiveId);
                  const remaining = lesson.objectives.filter((o) => !completed.has(o.id)).map((o) => o.id);
                  return { allComplete: remaining.length === 0, remaining };
                },
              });
              if (out.objectiveCompleted) send({ t: 'objective', id: out.objectiveCompleted });
              if (out.lessonComplete) lessonJustCompleted = true;
              return { type: 'tool_result', tool_use_id: tu.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
            }),
          );
          messages.push({ role: 'user', content: results });
        }

        if (lessonJustCompleted) {
          await touchLesson(user.id, course.id, lesson.id, { tutor_completed_at: new Date().toISOString() });
          await refreshCompletion(user.id, course, lesson);
          send({ t: 'lesson_complete' });
        }

        const reply = fullText.trim() || 'I’m sorry — I didn’t manage to write a reply. Could you ask that again?';
        const saved = (await one<{ id: number }>(
          "insert into chat_messages (user_id, lesson_id, role, content) values ($1, $2, 'assistant', $3) returning id",
          [user.id, lesson.id, reply],
        ))!;
        send({ t: 'done', messageId: saved.id, userMessageId });

        // Keep the running summary up to date (after the student already has their reply)
        const total = thread.length + 1;
        if (progress && needsSummary(total, progress.summarized_message_count)) {
          const fresh = await loadThread(user.id, lesson.id);
          await updateSummary(user.id, lesson.id, fresh, progress.chat_summary, progress.summarized_message_count).catch((e) =>
            console.error('summary failed', e),
          );
        }
      } catch (err) {
        console.error('tutor error', err);
        send({
          t: 'error',
          v:
            err instanceof HttpError
              ? err.message
              : err instanceof Anthropic.APIError || err instanceof Anthropic.APIConnectionError
                ? 'The AI tutor is temporarily unavailable. Your message is saved — please wait a minute and try again.'
                : friendlyMessage(err),
        });
        if (fullText.trim()) {
          await query("insert into chat_messages (user_id, lesson_id, role, content) values ($1, $2, 'assistant', $3)", [user.id, lesson.id, fullText.trim()]).catch(() => undefined);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
});
