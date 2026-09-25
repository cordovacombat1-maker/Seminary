// Claude, through Netlify's built-in AI Gateway. Netlify injects the connection details into
// every function automatically, so no API key is needed.
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './http';

let client: Anthropic | null = null;

export const AI_NOT_READY =
  'The AI tutor is not switched on yet. (Administrator: Netlify turns on its built-in AI automatically once the site has had one production deploy on a credit-based plan — see the README.)';

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function anthropic(): Anthropic {
  if (!client) {
    // ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL are injected by Netlify's AI Gateway.
    if (!aiAvailable()) throw new HttpError(503, AI_NOT_READY);
    client = new Anthropic({ maxRetries: 2 });
  }
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
