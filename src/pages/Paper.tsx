import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Markdown, PageTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { findLesson } from '../lib/curriculum';

interface Paper {
  title: string;
  content: string;
  status: 'draft' | 'submitted' | 'graded';
  scores: Record<string, number> | null;
  average: number | null;
  feedback: string | null;
  version: number;
  graded_at: string | null;
  history: { version: number; average: number; graded_at: string }[];
}
interface PaperResponse {
  paper: Paper | null;
  prompt: string;
  rubric: { key: string; label: string; description: string }[];
  passAverage: number;
  minWords: number;
}

export default function PaperPage() {
  const { lessonId } = useParams();
  const found = findLesson(lessonId);
  const [info, setInfo] = useState<PaperResponse | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    api<PaperResponse>(`/api/paper?lessonId=${encodeURIComponent(lessonId ?? '')}`)
      .then((r) => {
        setInfo(r);
        setTitle(r.paper?.title ?? '');
        setContent(r.paper?.content ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, [lessonId]);

  // autosave every 20 seconds while editing
  useEffect(() => {
    const t = setInterval(() => {
      if (dirty.current && !busy) void save(true);
    }, 20000);
    return () => clearInterval(t);
  });

  if (!found) return <Alert>Lesson not found.</Alert>;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  async function save(quiet = false) {
    dirty.current = false;
    try {
      const r = await api<{ paper: Paper }>('/api/paper', { method: 'PUT', body: JSON.stringify({ lessonId, title, content }) });
      setInfo((i) => i && { ...i, paper: r.paper });
      setSaved(`Draft saved at ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      if (!quiet) setError((e as Error).message);
      dirty.current = true;
    }
  }
  async function submit() {
    setBusy('Your professor is reading your paper… this can take up to a minute.');
    setError(null);
    setBanner(null);
    try {
      const r = await api<{ paper: Paper; passed: boolean; lessonCompleted: boolean; courseCompleted: boolean }>('/api/paper', {
        method: 'POST',
        body: JSON.stringify({ lessonId, title, content }),
      });
      setInfo((i) => i && { ...i, paper: r.paper });
      setBanner(
        r.courseCompleted
          ? 'Course complete! Your certificate is ready.'
          : r.passed
            ? 'Your paper passed. You can keep revising and resubmitting to improve your score.'
            : `Your paper needs an average of ${info?.passAverage ?? 3} to pass. Revise using the feedback and resubmit.`,
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const p = info?.paper;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={`/lesson/${found.lesson.id}`} className="text-sm text-burgundy-700 underline">← Back to the lesson</Link>
      <PageTitle sub={found.course.title}>Paper: {found.lesson.title}</PageTitle>
      {error && <Alert>{error}</Alert>}
      {banner && <Alert kind="success">{banner} {banner.startsWith('Course') && <Link className="underline" to={`/certificate/${found.course.id}`}>View certificate</Link>}</Alert>}
      {!info && !error && <Spinner />}
      {info && (
        <>
          <section className="card p-5">
            <h2 className="font-semibold">Assignment</h2>
            <Markdown text={info.prompt} />
            <h3 className="mt-4 text-sm font-semibold">Rubric (each scored 1–5; average {info.passAverage}+ to pass)</h3>
            <ul className="mt-1 space-y-1 text-sm text-stone-700">
              {info.rubric.map((r) => <li key={r.key}><strong>{r.label}:</strong> {r.description}</li>)}
            </ul>
          </section>

          {p?.status === 'graded' && p.scores && (
            <section className="card border-gold-400 p-5">
              <h2 className="font-semibold">Grade (version {p.version}) — average {p.average}/5 {Number(p.average) >= info.passAverage ? '✓ passed' : ''}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {info.rubric.map((r) => (
                  <div key={r.key} className="rounded-lg bg-stone-50 p-3 text-center">
                    <p className="text-2xl font-bold text-burgundy-800">{p.scores![r.key]}</p>
                    <p className="text-xs text-stone-600">{r.label}</p>
                  </div>
                ))}
              </div>
              {p.feedback && <div className="mt-4"><Markdown text={p.feedback} /></div>}
              {p.history.length > 1 && (
                <p className="mt-3 text-xs text-stone-500">Earlier versions: {p.history.slice(0, -1).map((h) => `v${h.version}: ${h.average}`).join(' · ')}</p>
              )}
            </section>
          )}

          <section className="card space-y-3 p-5">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" className="input" value={title} onChange={(e) => { setTitle(e.target.value); dirty.current = true; }} />
            </div>
            <div>
              <label className="label" htmlFor="content">Your paper</label>
              <textarea
                id="content"
                className="input min-h-[50vh] font-serif text-lg leading-relaxed"
                value={content}
                onChange={(e) => { setContent(e.target.value); dirty.current = true; }}
                placeholder="Write here. Cite sources as (Author, Title, section) and Scripture by book, chapter and verse."
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-stone-500">{words} words{words < info.minWords ? ` (minimum ${info.minWords})` : ''}{saved ? ` · ${saved}` : ''}</span>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => save()} disabled={!!busy}>Save draft</button>
                <button className="btn-primary" onClick={submit} disabled={!!busy || words < info.minWords}>{p?.version ? 'Resubmit for grading' : 'Submit for grading'}</button>
              </div>
            </div>
            {busy && <Spinner label={busy} />}
          </section>
        </>
      )}
    </div>
  );
}
