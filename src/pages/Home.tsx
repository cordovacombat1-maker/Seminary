import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { COURSES, TIERS } from '../lib/curriculum';

export default function Home() {
  const { session } = useAuth();
  if (session) return <Navigate to="/dashboard" replace />;
  const lessons = COURSES.reduce((n, c) => n + c.lessons.length, 0);
  return (
    <div className="space-y-12">
      <section className="py-6 text-center sm:py-12">
        <h1 className="font-serif text-4xl font-bold text-burgundy-800 sm:text-6xl">Study Scripture and theology<br className="hidden sm:block" /> at seminary depth.</h1>
        <p className="mx-auto mt-6 max-w-2xl font-serif text-lg text-stone-700">
          A complete MDiv-style curriculum — {COURSES.length} courses, {lessons} lessons — taught one-on-one by an AI tutor that asks you questions,
          grounds every answer in the Berean Standard Bible, real Greek and Hebrew data, and the great texts of the Christian tradition, and tells you when it doesn’t know.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/signup" className="btn-primary px-6 py-3 text-base">Start learning — it’s free</Link>
          <Link to="/login" className="btn-secondary px-6 py-3 text-base">Log in</Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['Socratic teaching', 'Short sections, real questions, and a tutor that checks your understanding before moving on.'],
          ['Grounded and cited', 'Answers cite the Church Fathers, Reformers, Wesley, Aquinas and more — author, title, section. Greek and Hebrew come from STEPBible data.'],
          ['Fair on disputed questions', 'Within the Nicene and Apostles’ Creeds, each tradition’s strongest case is presented — you weigh the arguments.'],
        ].map(([t, d]) => (
          <div key={t} className="card p-6">
            <h2 className="text-lg font-semibold text-burgundy-800">{t}</h2>
            <p className="mt-2 text-sm text-stone-600">{d}</p>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-bold text-burgundy-800">The curriculum</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {TIERS.map((t) => (
            <div key={t.tier} className="card p-5">
              <h3 className="font-semibold">{t.tier <= 5 ? `Tier ${t.tier}: ` : ''}{t.name}</h3>
              <p className="mt-1 text-sm text-stone-600">{t.courses.map((c) => c.title).join(' · ')}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-stone-500">Each completed course earns a certificate of completion. This is not an accredited degree program.</p>
      </section>
    </div>
  );
}
