// /api/admin (only the account whose email matches ADMIN_EMAIL)
//   GET                                   -> students, progress, and flagged tutor answers
//   POST { action: "review_flag", id, note } -> mark a flag reviewed
import type { Config } from '@netlify/functions';
import { allCourses } from '../lib/curriculum';
import { handle, HttpError, json, readJson } from '../lib/http';
import { adminClient, check, requireUser } from '../lib/supabase';

export const config: Config = { path: '/api/admin' };

export default handle(async (req: Request) => {
  const user = await requireUser(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only the administrator can open this page.');
  const db = adminClient();

  if (req.method === 'POST') {
    const body = await readJson<{ action?: string; id?: number; note?: string; status?: string }>(req);
    if (body.action !== 'review_flag') throw new HttpError(400, 'Unknown action');
    check(
      await db
        .from('flags')
        .update({ status: body.status === 'open' ? 'open' : 'reviewed', admin_note: body.note ?? null })
        .eq('id', Number(body.id)),
    );
    return json({ ok: true });
  }

  const [profiles, enrollments, lessons, certs, quizzes, flags] = await Promise.all([
    db.from('profiles').select('id, email, full_name, created_at').order('created_at', { ascending: false }).limit(1000),
    db.from('enrollments').select('user_id, course_id, started_at, completed_at').limit(10000),
    db.from('lesson_progress').select('user_id, course_id, lesson_id, completed_at, best_quiz_score, last_activity_at').limit(50000),
    db.from('certificates').select('user_id, course_id, issued_at').limit(10000),
    db.from('quiz_attempts').select('user_id, score').not('submitted_at', 'is', null).limit(50000),
    db.from('flags').select('id, user_id, lesson_id, message_id, message_excerpt, reason, status, admin_note, created_at').order('created_at', { ascending: false }).limit(500),
  ]);
  const P = check(profiles) as { id: string; email: string; full_name: string; created_at: string }[];
  const E = check(enrollments) as { user_id: string; course_id: string; completed_at: string | null }[];
  const L = check(lessons) as { user_id: string; completed_at: string | null; last_activity_at: string }[];
  const C = check(certs) as { user_id: string; course_id: string }[];
  const Q = check(quizzes) as { user_id: string; score: number }[];
  const F = check(flags) as { id: number; user_id: string; message_id: number | null }[];

  const messageIds = F.map((f) => f.message_id).filter((x): x is number => !!x);
  const msgs = messageIds.length ? (check(await db.from('chat_messages').select('id, content').in('id', messageIds)) as { id: number; content: string }[]) : [];
  const msgMap = new Map(msgs.map((m) => [m.id, m.content]));
  const emailOf = new Map(P.map((p) => [p.id, p.email]));

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
      lastActive: myLessons.map((l) => l.last_activity_at).sort().pop() ?? null,
    };
  });

  return json({
    totals: { students: P.length, lessons: allCourses().reduce((n, c) => n + c.lessons.length, 0), openFlags: F.filter((f) => (f as { status?: string }).status === 'open').length },
    students,
    flags: F.map((f) => ({ ...f, email: emailOf.get(f.user_id) ?? '', message: f.message_id ? msgMap.get(f.message_id) ?? '' : '' })),
  });
});
