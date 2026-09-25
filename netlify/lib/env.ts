// Settings. None are required: Netlify supplies the database and the AI connection automatically.
// Optional variables can be added in Netlify -> Site configuration -> Environment variables.

export const MODELS = {
  teacher: 'claude-sonnet-5', // teaching and grading papers
  fast: 'claude-haiku-4-5-20251001', // quizzes, drills, summaries
};

/** Optional TUTOR_DAILY_MESSAGE_LIMIT: tutor messages each student may send per day (default 150). */
export function dailyMessageLimit(): number {
  const n = Number(process.env.TUTOR_DAILY_MESSAGE_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 150;
}
