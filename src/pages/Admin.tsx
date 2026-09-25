import { useEffect, useRef, useState } from 'react';
import { Alert, Markdown, PageTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { findLesson } from '../lib/curriculum';

interface AdminData {
  totals: { students: number; lessons: number; openFlags: number };
  students: { id: string; email: string; full_name: string; created_at: string; coursesStarted: number; coursesCompleted: number; lessonsCompleted: number; certificates: number; averageQuiz: number | null; lastActive: string | null }[];
  flags: { id: number; email: string; lesson_id: string; message: string; message_excerpt: string; reason: string; status: string; admin_note: string | null; created_at: string }[];
  loading: LoadStep[];
}

interface LoadStep {
  id: string;
  label: string;
  group: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  detail: string;
  rows: number;
}

const STATUS_STYLE: Record<LoadStep['status'], string> = {
  pending: 'text-stone-500',
  running: 'text-amber-700',
  done: 'text-emerald-700',
  failed: 'text-red-700',
  skipped: 'text-stone-500',
};

function LoadTexts({ initial }: { initial: LoadStep[] }) {
  const [steps, setSteps] = useState(initial);
  const [running, setRunning] = useState<string | null>(null);
  const stop = useRef(false);
  const run = async (includeExtra: boolean) => {
    stop.current = false;
    const todo = steps.filter((s) => (s.status === 'pending' || s.status === 'failed' || s.status === 'running') && (includeExtra || s.group !== 'Library (extra)'));
    for (const step of todo) {
      if (stop.current) break;
      setRunning(step.label);
      setSteps((all) => all.map((s) => (s.id === step.id ? { ...s, status: 'running', detail: 'Working… (this can take up to a minute)' } : s)));
      try {
        const res = await api<{ step: LoadStep }>('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'load', step: step.id }) });
        setSteps((all) => all.map((s) => (s.id === step.id ? res.step : s)));
      } catch (e) {
        setSteps((all) => all.map((s) => (s.id === step.id ? { ...s, status: 'failed', detail: (e as Error).message } : s)));
      }
    }
    setRunning(null);
  };
  const groups = [...new Set(steps.map((s) => s.group))];
  const core = steps.filter((s) => s.group !== 'Library (extra)');
  const coreDone = core.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const failed = steps.filter((s) => s.status === 'failed').length;
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <p>
          This loads the Bible (BSB, KJV, WEB), the STEPBible Greek and Hebrew data, and the public-domain library into the database. Click the button
          once and <strong>keep this page open</strong> until it finishes (roughly 15–30 minutes). If you close it, just click again later — finished parts are skipped.
        </p>
        <p className="text-sm text-stone-600">{coreDone} of {core.length} main parts loaded{failed ? ` · ${failed} could not be downloaded (click the button again to retry)` : ''}.</p>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <button className="btn-secondary" onClick={() => (stop.current = true)}>Stop after this part</button>
          ) : (
            <>
              <button className="btn-primary" onClick={() => run(false)}>{coreDone ? 'Continue loading texts' : 'Load texts'}</button>
              <button className="btn-secondary" onClick={() => run(true)}>Also load the extra library books</button>
            </>
          )}
        </div>
        {running && <Alert kind="info">Loading: {running}…</Alert>}
      </div>
      {groups.map((g) => (
        <div key={g} className="card overflow-hidden">
          <h3 className="bg-stone-50 px-4 py-2 font-semibold">{g}</h3>
          <ul className="divide-y divide-stone-100 text-sm">
            {steps.filter((s) => s.group === g).map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>{s.label}</span>
                <span className={STATUS_STYLE[s.status]}>{s.status === 'pending' ? 'not loaded yet' : s.status}{s.detail ? ` — ${s.detail}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'students' | 'flags' | 'texts'>('students');
  const [showReviewed, setShowReviewed] = useState(false);
  const load = () => api<AdminData>('/api/admin').then(setData).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const review = async (id: number, status: 'reviewed' | 'open') => {
    const note = status === 'reviewed' ? prompt('Optional note (what you found / fixed):') ?? '' : '';
    await api('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'review_flag', id, status, note }) });
    await load();
  };
  const flags = data.flags.filter((f) => showReviewed || f.status === 'open');
  const resetPassword = async (s: AdminData['students'][number]) => {
    if (!confirm(`Set a new temporary password for ${s.email}? Their current password will stop working.`)) return;
    try {
      const r = await api<{ email: string; password: string }>('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'reset_password', userId: s.id }) });
      alert(`Temporary password for ${r.email}:\n\n${r.password}\n\nGive it to them privately. They can change it under Account after logging in.`);
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <div className="space-y-6">
      <PageTitle sub={`${data.totals.students} students · ${data.totals.lessons} lessons in the curriculum · ${data.totals.openFlags} open flags`}>Admin</PageTitle>
      <div className="flex gap-2">
        <button className={tab === 'students' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('students')}>Students</button>
        <button className={tab === 'flags' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('flags')}>Flagged answers ({data.totals.openFlags})</button>
        <button className={tab === 'texts' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('texts')}>Load texts</button>
      </div>
      {tab === 'students' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>{['Name', 'Email', 'Joined', 'Courses started', 'Courses done', 'Lessons done', 'Avg quiz', 'Last active', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id} className="border-t border-stone-100">
                  <td className="px-3 py-2">{s.full_name || '—'}</td>
                  <td className="px-3 py-2">{s.email}</td>
                  <td className="px-3 py-2">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{s.coursesStarted}</td>
                  <td className="px-3 py-2">{s.coursesCompleted}</td>
                  <td className="px-3 py-2">{s.lessonsCompleted}</td>
                  <td className="px-3 py-2">{s.averageQuiz != null ? `${s.averageQuiz}%` : '—'}</td>
                  <td className="px-3 py-2">{s.lastActive ? new Date(s.lastActive).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2"><button className="text-burgundy-700 underline" onClick={() => resetPassword(s)}>Reset password</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'texts' && <LoadTexts initial={data.loading} />}
      {tab === 'flags' && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} /> Show reviewed flags</label>
          {flags.length === 0 && <Alert kind="info">No flags to review.</Alert>}
          {flags.map((f) => (
            <div key={f.id} className="card p-5">
              <div className="flex flex-wrap justify-between gap-2 text-sm text-stone-500">
                <span>{f.email} · {findLesson(f.lesson_id)?.lesson.title ?? f.lesson_id} · {new Date(f.created_at).toLocaleString()}</span>
                <span className={f.status === 'open' ? 'font-semibold text-red-700' : 'text-emerald-700'}>{f.status}</span>
              </div>
              <p className="mt-2"><strong>Student’s report:</strong> {f.reason || '(no reason given)'}</p>
              <div className="mt-3 max-h-80 overflow-y-auto rounded-lg bg-stone-50 p-3"><Markdown text={f.message || f.message_excerpt} className="reading prose-sm" /></div>
              {f.admin_note && <p className="mt-2 text-sm text-stone-600">Note: {f.admin_note}</p>}
              <div className="mt-3">
                {f.status === 'open' ? <button className="btn-secondary" onClick={() => review(f.id, 'reviewed')}>Mark reviewed</button> : <button className="btn-ghost" onClick={() => review(f.id, 'open')}>Reopen</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
