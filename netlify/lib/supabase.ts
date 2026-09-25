// Supabase clients. The service-role client bypasses Row Level Security, so it is used
// only on the server and always filtered by the verified user's id.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isAdminEmail } from './env';
import { HttpError } from './http';

let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (!admin) {
    admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export interface AuthedUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/** Verify the student's Supabase access token from the Authorization header. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please log in first.');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please log in again.');
  const email = data.user.email ?? '';
  return { id: data.user.id, email, isAdmin: isAdminEmail(email) };
}

/** Throw a friendly error if a Supabase query failed. */
export function check<T>(res: { data: T; error: { message: string } | null }, what = 'database'): T {
  if (res.error) {
    console.error(`${what} error:`, res.error.message);
    throw new HttpError(500, 'We could not reach the database just now. Please try again in a moment.');
  }
  return res.data;
}
