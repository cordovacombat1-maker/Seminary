import { Link } from 'react-router-dom';
import { courseUnlocked, lessonUnlocked } from '../../shared/progress';
import { Alert, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { COURSES, findLesson, TIERS } from '../lib/curriculum';
import { useProgress } from '../lib/progress';

export default function Dashboard() {
  const { session, profile } = useAuth();
  const { data, error } = useProgress(session?.user.id);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  // "Continue where you left off": the most recent unfinished lesson, else the next open lesson
  const recent = [...data.lessons.values()].filter((r) => !r.completed_at).sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))[0];
  let resume = recent ? findLesson(recent.lesson_id) : undefined;
  if (!resume) {
    for (const course of COURSES) {
      if (!courseUnlocked(course, data.completedCourses) || data.completedCourses.has(course.id)) continue;
      const i = course.lessons.findIndex((l, idx) => !data.completedLessons.has(l.id) && lessonUnlocked(course, idx, data.completedCourses, data.completedLessons));
      if (i >= 0 && data.enrolled.has(course.id)) {
        resume = { course, lesson: course.lessons[i], index: i };
        break;
      }
    }
  }
  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <div className="space-y-10">
      <PageTitle sub="Work through the tiers in order. Courses unlock when you finish their prerequisites.">
        {firstName ? `Welcome back, ${firstName}` : 'Your studies'}
      </PageTitle>

      {resume ? (
        <div className="card flex flex-col gap-4 border-burgundy-100 bg-burgundy-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-stone-600">Continue where you left off</p>
            <p className="font-serif text-lg font-semibold">{resume.course.title} — {resume.lesson.title}</p>
          </div>
          <Link to={`/lesson/${resume.lesson.id}`} className="btn-primary">Continue</Link>
        </div>
      ) : (
        <Alert kind="info">Start with any Tier 1 course below — Hermeneutics is a great first step.</Alert>
      )}

      {TIERS.map((tier) => (
        <section key={tier.tier}>
          <h2 className="mb-3 text-xl font-bold text-burgundy-800">{tier.tier <= 5 ? `Tier ${tier.tier}: ` : ''}{tier.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tier.courses.map((course) => {
              const unlocked = courseUnlocked(course, data.completedCourses);
              const done = course.lessons.filter((l) => data.completedLessons.has(l.id)).length;
              const complete = data.completedCourses.has(course.id);
              const missing = course.prerequisites.filter((p) => !data.completedCourses.has(p)).map((p) => COURSES.find((c) => c.id === p)?.title ?? p);
              return (
                <Link
                  key={course.id}
                  to={`/course/${course.id}`}
                  className={`card block p-5 transition hover:shadow-md ${unlocked ? '' : 'opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif text-lg font-semibold leading-snug">{course.title}</h3>
                    <span className="shrink-0 text-lg" aria-hidden>{complete ? '🎓' : unlocked ? '' : '🔒'}</span>
                  </div>
                  {course.elective && <span className="mt-1 inline-block rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Elective</span>}
                  <div className="mt-3"><ProgressBar value={done} max={course.lessons.length} /></div>
                  <p className="mt-2 text-xs text-stone-500">
                    {complete ? 'Complete — certificate earned' : unlocked ? `${done} of ${course.lessons.length} lessons` : `Requires: ${missing.join(', ')}`}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
