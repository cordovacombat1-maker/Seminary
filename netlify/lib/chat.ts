// Chat history: trimming to the last 20 messages plus a running summary.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, textOf } from './anthropic';
import { MODELS } from './env';
import { adminClient, check } from './supabase';

export const HISTORY_WINDOW = 20;
const SUMMARY_BATCH = 10; // re-summarise once this many messages have fallen out of the window

export interface ChatRow {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export async function loadThread(userId: string, lessonId: string): Promise<ChatRow[]> {
  return check(
    await adminClient()
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .order('created_at')
      .order('id')
      .limit(2000),
  ) as ChatRow[];
}

/** The messages actually sent to the model: the last 20, starting with a user turn. */
export function buildWindow(thread: Pick<ChatRow, 'role' | 'content'>[]): Anthropic.MessageParam[] {
  const recent = thread.slice(-HISTORY_WINDOW);
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of recent) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content = `${last.content as string}\n\n${m.content}`;
    else msgs.push({ role: m.role, content: m.content });
  }
  if (!msgs.length || msgs[0].role !== 'user') {
    msgs.unshift({
      role: 'user',
      content: thread.length > recent.length ? '(Continuing the lesson — see the summary of earlier conversation.)' : '(I have opened the lesson. Please begin.)',
    });
  }
  return msgs;
}

export function needsSummary(total: number, summarizedCount: number): boolean {
  return total - HISTORY_WINDOW - summarizedCount >= SUMMARY_BATCH;
}

/** Fold messages that have scrolled out of the window into the running summary (Haiku). */
export async function updateSummary(
  userId: string,
  lessonId: string,
  thread: ChatRow[],
  oldSummary: string,
  summarizedCount: number,
): Promise<void> {
  const cutoff = thread.length - HISTORY_WINDOW;
  if (cutoff <= summarizedCount) return;
  const slice = thread.slice(summarizedCount, cutoff);
  const transcript = slice.map((m) => `${m.role === 'user' ? 'STUDENT' : 'TUTOR'}: ${m.content}`).join('\n\n');
  const res = await anthropic().messages.create({
    model: MODELS.fast,
    max_tokens: 1200,
    system:
      'You maintain a concise running summary of a tutoring conversation in a seminary course. Keep: what has been taught, what the student understood or struggled with, the student\'s stated views and questions, and any sources cited (author, title, section). Under 350 words. Plain prose.',
    messages: [
      {
        role: 'user',
        content: `Existing summary:\n${oldSummary || '(none yet)'}\n\nNew conversation to fold in:\n${transcript}\n\nWrite the updated summary.`,
      },
    ],
  });
  check(
    await adminClient()
      .from('lesson_progress')
      .update({ chat_summary: textOf(res).trim(), summarized_message_count: cutoff })
      .eq('user_id', userId)
      .eq('lesson_id', lessonId),
  );
}

export async function userMessagesToday(userId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const res = await adminClient()
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', since.toISOString());
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
