// Small helpers for JSON responses and friendly errors.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Wrap a handler so every failure becomes a friendly JSON error instead of a crash. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: friendlyMessage(err) }, 500);
}

export function friendlyMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ANTHROPIC|anthropic|overloaded|529|rate_limit/i.test(msg))
    return 'The AI tutor is temporarily unavailable. Please wait a minute and try again.';
  if (/supabase|postgres|fetch failed|ECONN|relation .* does not exist/i.test(msg))
    return 'We could not reach the database just now. Please try again in a moment.';
  return 'Something went wrong on our side. Please try again.';
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'The request was not valid JSON.');
  }
}
