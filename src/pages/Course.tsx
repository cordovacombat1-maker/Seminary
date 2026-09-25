import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { courseUnlocked, lessonUnlocked } from '../../shared/progress';
import { Alert, Check, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { COURSES, getCourse } from '../lib/curriculum';
import { useProgress } from '../lib/progress';

export default function CoursePage() {
  const { courseId } = useParams();
  const course = getCourse(courseId);
  const { session, isAdmin } = useAuth();
  const { data, error } = useProgress(session?.user.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!course) return <Alert>Course not found.</Alert>;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const unlocked = isAdmin || courseUnlocked(course, data.completedCourses);
  const done = course.lessons.filter((l) => data.completedLessons.has(l.id)).length;
  const cert = data.certificates.find((c) => c.course_id === course.id);
  const enrolled = data.enrolled.has(course.id);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/enroll', { method: 'POST', body: JSON.stringify({ courseId: course.id }) });
      navigate(`/lesson/${course.lessons[0].id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/dashboard" className="text-sm text-burgundy-700 underline">← Dashboard</Link>
      <PageTitle sub={`${course.tier <= 5 ? `Tier ${course.tier}` : 'Capstone'} · ${course.tier_name}${course.elective ? ' · Elective' : ''}`}>{course.title}</PageTitle>
      <p className="max-w-3xl font-serif text-lg leading-relaxed text-stone-700">{course.description}</p>
      {course.prerequisites.length > 0 && (
        <p className="text-sm text-stone-600">
          Prerequisites:{' '}
          {course.prerequisites.map((p, i) => (
            <span key={p}>
              {i > 0 && ', '}
              <Link className="underline" to={`/course/${p}`}>{COURSES.find((c) => c.id === p)?.title ?? p}</Link>
              {data.completedCourses.has(p) ? ' ✓' : ''}
            </span>
          ))}
        </p>
      )}
      {err && <Alert>{err}</Alert>}
      {cert && (
        <div className="card flex flex-col gap-3 border-gold-400 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif text-lg">🎓 You completed this course on {new Date(cert.issued_at).toLocaleDateString()}.</p>
          <Link to={`/certificate/${course.id}`} className="btn-primary">View certificate</Link>
        </div>
      )}
      {!unlocked && <Alert kind="info">This course unlocks when you complete its prerequisites.</Alert>}
      {unlocked && !enrolled && (
        <button className="btn-primary" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start this course'}</button>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-stone-600">
          <span>{done} of {course.lessons.length} lessons complete</span>
        </div>
        <ProgressBar value={done} max={course.lessons.length} />
      </div>
      <ol className="space-y-2">
        {course.lessons.map((lesson, i) => {
          const open = isAdmin || lessonUnlocked(course, i, data.completedCourses, data.completedLessons);
          const isDone = data.completedLessons.has(lesson.id);
          const row = data.lessons.get(lesson.id);
          const inner = (
            <div className="flex items-center gap-3">
              <Check done={isDone} />
              <div className="flex-1">
                <p className="font-medium">
                  <span className="text-stone-500">{i + 1}.</span> {lesson.title}
                </p>
                {row && !isDone && (
                  <p className="text-xs text-stone-500">
                    {row.tutor_completed_at ? 'Tutor ✓' : 'Tutor in progress'} · {row.quiz_passed_at ? 'Quiz ✓' : 'Quiz pending'}
                    {lesson.paper_prompt ? ` · ${row.paper_passed_at ? 'Paper ✓' : 'Paper pending'}` : ''}
                  </p>
                )}
              </div>
              {!open && <span aria-label="locked">🔒</span>}
            </div>
          );
          return (
            <li key={lesson.id}>
              {open && (enrolled || isAdmin) ? (
                <Link to={`/lesson/${lesson.id}`} className="card block p-4 hover:shadow-md">{inner}</Link>
              ) : (
                <div className="card p-4 opacity-70">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
