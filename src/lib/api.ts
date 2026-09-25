import { db } from './config';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<ApiError> {
  let msg = `Something went wrong (error ${res.status}). Please try again.`;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
  } catch {
    /* not JSON */
  }
  if (res.status === 502 || res.status === 504) msg = 'The server took too long to respond. Please try again.';
  return new ApiError(res.status, msg);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(await authHeaders()), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Could not connect. Check your internet connection and try again.');
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export type TutorEvent =
  | { t: 'text'; v: string }
  | { t: 'status'; v: string }
  | { t: 'objective'; id: string }
  | { t: 'lesson_complete' }
  | { t: 'done'; messageId: number; userMessageId: number | null }
  | { t: 'error'; v: string };

/** POST to the tutor and call onEvent for each streamed event. */
export async function streamTutor(body: Record<string, unknown>, onEvent: (e: TutorEvent) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not connect. Check your internet connection and try again.');
  }
  if (!res.ok) throw await parseError(res);
  if ((res.headers.get('content-type') ?? '').includes('application/json')) return; // e.g. already started
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as TutorEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as TutorEvent);
}
