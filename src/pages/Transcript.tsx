import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, PageTitle, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { db } from '../lib/config';
import { COURSES, findLesson } from '../lib/curriculum';
import { useProgress } from '../lib/progress';

export default function Transcript() {
  const { session, profile } = useAuth();
  const { data, error } = useProgress(session?.user.id);
  const [quizzes, setQuizzes] = useState<{ lesson_id: string; score: number; passed: boolean; submitted_at: string }[] | null>(null);
  const [papers, setPapers] = useState<{ lesson_id: string; title: string; average: number | null; version: number; graded_at: string | null }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      db().from('quiz_attempts').select('lesson_id, score, passed, submitted_at').not('submitted_at', 'is', null).order('submitted_at'),
      db().from('papers').select('lesson_id, title, average, version, graded_at'),
    ]).then(([q, p]) => {
      if (q.error || p.error) return setErr('We could not load your scores just now. Please refresh.');
      setQuizzes(q.data as typeof quizzes);
      setPapers(p.data as typeof papers);
    });
  }, []);

  if (error || err) return <Alert>{error ?? err}</Alert>;
  if (!data || !quizzes || !papers) return <Spinner />;
  const started = COURSES.filter((c) => data.enrolled.has(c.id));

  return (
    <div className="space-y-8">
      <PageTitle sub={`${profile?.full_name || profile?.email || ''} · Record of study (not an accredited transcript)`}>Progress &amp; transcript</PageTitle>
      <div className="flex gap-2 no-print"><button className="btn-secondary" onClick={() => window.print()}>Print</button></div>
      {started.length === 0 && <Alert kind="info">You haven’t started any courses yet. <Link className="underline" to="/dashboard">Choose one on your dashboard.</Link></Alert>}
      {started.map((course) => {
        const cert = data.certificates.find((c) => c.course_id === course.id);
        const done = course.lessons.filter((l) => data.completedLessons.has(l.id)).length;
        return (
          <section key={course.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-5 py-3">
              <h2 className="font-serif text-lg font-semibold">{course.title}</h2>
              <span className="text-sm">
                {cert ? <Link className="text-burgundy-700 underline" to={`/certificate/${course.id}`}>Completed {new Date(cert.issued_at).toLocaleDateString()} · Certificate</Link> : `${done}/${course.lessons.length} lessons`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500">
                  <tr><th className="px-5 py-2 font-medium">Lesson</th><th className="px-3 py-2 font-medium">Best quiz</th><th className="px-3 py-2 font-medium">Attempts</th><th className="px-3 py-2 font-medium">Paper</th><th className="px-3 py-2 font-medium">Status</th></tr>
                </thead>
                <tbody>
                  {course.lessons.map((l) => {
                    const attempts = quizzes.filter((q) => q.lesson_id === l.id);
                    const best = attempts.length ? Math.max(...attempts.map((a) => Number(a.score))) : null;
                    const paper = papers.find((p) => p.lesson_id === l.id);
                    return (
                      <tr key={l.id} className="border-t border-stone-100">
                        <td className="px-5 py-2">{l.title}</td>
                        <td className="px-3 py-2">{best != null ? `${Math.round(best)}%` : '—'}</td>
                        <td className="px-3 py-2">{attempts.length || '—'}</td>
                        <td className="px-3 py-2">{l.paper_prompt ? (paper?.average != null ? `${paper.average}/5 (v${paper.version})` : paper ? 'Draft' : '—') : 'n/a'}</td>
                        <td className="px-3 py-2">{data.completedLessons.has(l.id) ? '✓ Complete' : data.lessons.has(l.id) ? 'In progress' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {quizzes.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">All quiz attempts ({quizzes.length})</summary>
          <ul className="mt-3 space-y-1 text-sm">
            {quizzes.map((q, i) => (
              <li key={i}>{new Date(q.submitted_at).toLocaleString()} — {findLesson(q.lesson_id)?.lesson.title ?? q.lesson_id}: {Math.round(Number(q.score))}% {q.passed ? '✓' : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
