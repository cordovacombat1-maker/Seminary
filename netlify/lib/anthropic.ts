import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 2 });
  return client;
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences). */
export function parseJsonReply<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('No JSON in model reply');
  return JSON.parse(body.slice(start, Math.max(body.lastIndexOf('}'), body.lastIndexOf(']')) + 1)) as T;
}
