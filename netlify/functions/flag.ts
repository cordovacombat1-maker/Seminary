// /api/flag  POST { lessonId, messageId, reason } -> report a tutor answer to the administrator
import type { Config } from '@netlify/functions';
import { requireUser } from '../lib/auth';
import { findLesson } from '../lib/curriculum';
import { one, query } from '../lib/db';
import { handle, HttpError, json, readJson } from '../lib/http';

export const config: Config = { path: '/api/flag' };

export default handle(async (req: Request) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req);
  const body = await readJson<{ lessonId?: string; messageId?: number; reason?: string; excerpt?: string }>(req);
  const { lesson } = findLesson(body.lessonId ?? '');
  // Only the student's own tutor messages can be flagged
  const messageId = Number(body.messageId);
  const msg = Number.isInteger(messageId)
    ? await one<{ id: number; content: string }>(
        "select id, content from chat_messages where id = $1 and user_id = $2 and lesson_id = $3 and role = 'assistant'",
        [messageId, user.id, lesson.id],
      )
    : null;
  const excerpt = (msg?.content ?? String(body.excerpt ?? '')).slice(0, 1000);
  if (!excerpt.trim()) throw new HttpError(400, 'Nothing to report.');
  await query('insert into flags (user_id, lesson_id, message_id, message_excerpt, reason) values ($1, $2, $3, $4, $5)', [
    user.id,
    lesson.id,
    msg?.id ?? null,
    excerpt,
    String(body.reason ?? '').trim().slice(0, 1000),
  ]);
  return json({ ok: true });
});
