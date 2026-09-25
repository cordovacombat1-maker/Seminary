// /api/admin (administrator only: the first account created, or the one named in ADMIN_EMAIL)
//   GET                                          -> students, progress, flagged tutor answers, text-loading status
//   POST { action: "review_flag", id, note }     -> mark a flag reviewed
//   POST { action: "reset_password", userId }    -> set a temporary password for a student
//   POST { action: "load", step, force? }        -> run one text-loading step
import type { Config } from '@netlify/functions';
import { hashPassword, requireUser, temporaryPassword } from '../lib/auth';
import { allCourses } from '../lib/curriculum';
import { one, query } from '../lib/db';
import { handle, HttpError, json, readJson } from '../lib/http';
import { loadStatus, runLoadStep } from '../lib/loader';

export const config: Config = { path: '/api/admin' };

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only the administrator can open this page.');

  if (req.method === 'POST') {
    const body = await readJson<{ action?: string; id?: number; note?: string; status?: string; userId?: string; step?: string; force?: boolean }>(req);
    switch (body.action) {
      case 'review_flag':
        await query('update flags set status = $1, admin_note = $2 where id = $3', [body.status === 'open' ? 'open' : 'reviewed', body.note ?? null, Number(body.id)]);
        return json({ ok: true });
      case 'reset_password': {
        const target = await one<{ id: string; email: string }>('select id, email from users where id::text = $1', [String(body.userId ?? '')]);
        if (!target) throw new HttpError(404, 'Student not found.');
        const password = temporaryPassword();
        await query('update users set password_hash = $1 where id = $2', [await hashPassword(password), target.id]);
        await query('delete from sessions where user_id = $1', [target.id]);
        return json({ email: target.email, password });
      }
      case 'load':
        return json({ step: await runLoadStep(String(body.step ?? ''), !!body.force) });
      default:
        throw new HttpError(400, 'Unknown action');
    }
  }

  const [P, E, L, C, Q, F, loading] = await Promise.all([
    query<{ id: string; email: string; full_name: string; created_at: string }>('select id, email, full_name, created_at from users order by created_at desc limit 1000'),
    query<{ user_id: string; completed_at: string | null }>('select user_id, completed_at from enrollments'),
    query<{ user_id: string; completed_at: string | null; last_activity_at: string }>('select user_id, completed_at, last_activity_at from lesson_progress'),
    query<{ user_id: string }>('select user_id from certificates'),
    query<{ user_id: string; score: number }>('select user_id, score from quiz_attempts where submitted_at is not null'),
    query<{ id: number; user_id: string; lesson_id: string; message_id: number | null; message_excerpt: string; reason: string; status: string; admin_note: string | null; created_at: string; email: string; message: string | null }>(
      `select f.*, u.email, m.content as message
         from flags f left join users u on u.id = f.user_id left join chat_messages m on m.id = f.message_id
        order by f.created_at desc limit 500`,
    ),
    loadStatus(),
  ]);

  const students = P.map((p) => {
    const myLessons = L.filter((l) => l.user_id === p.id);
    const myQuiz = Q.filter((q) => q.user_id === p.id);
    return {
      ...p,
      coursesStarted: E.filter((e) => e.user_id === p.id).length,
      coursesCompleted: E.filter((e) => e.user_id === p.id && e.completed_at).length,
      lessonsCompleted: myLessons.filter((l) => l.completed_at).length,
      certificates: C.filter((c) => c.user_id === p.id).length,
      averageQuiz: myQuiz.length ? Math.round(myQuiz.reduce((s, q) => s + Number(q.score), 0) / myQuiz.length) : null,
      lastActive: myLessons.map((l) => new Date(l.last_activity_at).toISOString()).sort().pop() ?? null,
    };
  });

  return json({
    totals: { students: P.length, lessons: allCourses().reduce((n, c) => n + c.lessons.length, 0), openFlags: F.filter((f) => f.status === 'open').length },
    students,
    flags: F.map((f) => ({ ...f, message: f.message ?? f.message_excerpt })),
    loading,
  });
});
