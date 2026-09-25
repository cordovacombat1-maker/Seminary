import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, PageTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { findLesson } from '../lib/curriculum';

interface DrillItem {
  wordId: number;
  word: string;
  transliteration: string | null;
  lemma: string | null;
  gloss: string | null;
  reference: string;
  askFields: string[];
}
interface DrillSet {
  instructions?: string;
  language?: string;
  fields: { key: string; label: string }[];
  options: Record<string, string[]>;
  items: DrillItem[];
  note?: string;
}
interface CheckResult {
  allCorrect: boolean;
  results: { field: string; label: string; expected: string; given: string; correct: boolean }[];
  morphologyCode: string;
  summary: string | null;
  explanation: string | null;
  english: string | null;
}

export default function DrillPage() {
  const { lessonId } = useParams();
  const found = findLesson(lessonId);
  const [set, setSet] = useState<DrillSet | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [score, setScore] = useState({ right: 0, done: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setSet(null);
    setError(null);
    setI(0);
    setScore({ right: 0, done: 0 });
    setAnswers({});
    setResult(null);
    try {
      setSet(await api<DrillSet>(`/api/drill?lessonId=${encodeURIComponent(lessonId ?? '')}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  if (!found) return <Alert>Lesson not found.</Alert>;
  const item = set?.items[i];
  const check = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const r = await api<CheckResult>('/api/drill', { method: 'POST', body: JSON.stringify({ lessonId, wordId: item.wordId, answers }) });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.allCorrect ? 1 : 0), done: s.done + 1 }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    setI(i + 1);
    setAnswers({});
    setResult(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to={`/lesson/${found.lesson.id}`} className="text-sm text-burgundy-700 underline">← Back to the lesson</Link>
      <PageTitle sub="Words are drawn at random from the Greek New Testament / Hebrew Bible. Answers are checked against STEPBible’s morphology tags.">Parsing drill: {found.lesson.title}</PageTitle>
      {error && <Alert>{error}</Alert>}
      {!set && !error && <Spinner label="Choosing words…" />}
      {set?.note && <Alert kind="info">{set.note}</Alert>}
      {set?.instructions && <p className="text-stone-700">{set.instructions}</p>}
      {set && set.items.length > 0 && i >= set.items.length && (
        <div className="card p-6 text-center">
          <p className="font-serif text-2xl">You parsed {score.right} of {score.done} words perfectly.</p>
          <button className="btn-primary mt-4" onClick={load}>New set of words</button>
        </div>
      )}
      {item && (
        <div className="card p-6">
          <div className="flex items-baseline justify-between text-sm text-stone-500">
            <span>Word {i + 1} of {set!.items.length}</span>
            <span>{item.reference}</span>
          </div>
          <p className={`mt-4 text-center font-greek text-5xl ${set!.language === 'hebrew' ? 'leading-relaxed' : ''}`} dir={set!.language === 'hebrew' ? 'rtl' : 'ltr'} lang={set!.language === 'hebrew' ? 'he' : 'grc'}>
            {item.word.replace(/\//g, '')}
          </p>
          {item.transliteration && <p className="mt-1 text-center text-stone-500">{item.transliteration}</p>}
          <p className="mt-2 text-center text-sm text-stone-600">
            Lexical form: <span className="font-greek text-base">{item.lemma}</span>{item.gloss ? ` — “${item.gloss}”` : ''}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {set!.fields.filter((f) => item.askFields.includes(f.key)).map((f) => {
              const r = result?.results.find((x) => x.field === f.key);
              return (
                <div key={f.key}>
                  <label className="label" htmlFor={f.key}>{f.label}</label>
                  <select
                    id={f.key}
                    className={`input ${r ? (r.correct ? 'border-emerald-500 bg-emerald-50' : 'border-red-400 bg-red-50') : ''}`}
                    value={answers[f.key] ?? ''}
                    disabled={!!result}
                    onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {(set!.options[f.key] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {r && !r.correct && <p className="mt-1 text-sm text-red-700">Correct: {r.expected}</p>}
                </div>
              );
            })}
          </div>
          {result && (
            <div className="mt-5 rounded-lg bg-stone-50 p-4 text-sm">
              <p className="font-semibold">{result.allCorrect ? '✓ Perfect!' : 'Not quite — see the corrections above.'}</p>
              <p className="mt-1">STEPBible code <code className="rounded bg-white px-1">{result.morphologyCode}</code>{result.summary ? `: ${result.summary}` : ''}</p>
              {result.english && <p className="mt-1">In context: “{result.english}”</p>}
              {result.explanation && <p className="mt-1 text-stone-600">{result.explanation}</p>}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            {!result ? (
              <button className="btn-primary" onClick={check} disabled={busy}>Check</button>
            ) : (
              <button className="btn-primary" onClick={next}>Next word →</button>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-stone-500">Data: STEPBible.org (Tyndale House, Cambridge), CC BY 4.0.</p>
    </div>
  );
}
