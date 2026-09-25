// Environment variables. Values are set in Netlify -> Site configuration -> Environment variables.
import { HttpError } from './http';

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(503, `The site is not fully set up yet: the ${name} setting is missing. (Admin: add it in Netlify's environment variables.)`);
  return v;
}

export const optionalEnv = (name: string) => process.env[name] || undefined;

export const MODELS = {
  teacher: 'claude-sonnet-5', // teaching and grading papers
  fast: 'claude-haiku-4-5-20251001', // quizzes, drills, summaries
};

export function dailyMessageLimit(): number {
  const n = Number(process.env.TUTOR_DAILY_MESSAGE_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 150;
}

export function isAdminEmail(email: string | undefined | null): boolean {
  const admin = process.env.ADMIN_EMAIL;
  return !!admin && !!email && admin.trim().toLowerCase() === email.trim().toLowerCase();
}
