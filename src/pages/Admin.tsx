import { useEffect, useState } from 'react';
import { Alert, Markdown, PageTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { findLesson } from '../lib/curriculum';

interface AdminData {
  totals: { students: number; lessons: number; openFlags: number };
  students: { id: string; email: string; full_name: string; created_at: string; coursesStarted: number; coursesCompleted: number; lessonsCompleted: number; certificates: number; averageQuiz: number | null; lastActive: string | null }[];
  flags: { id: number; email: string; lesson_id: string; message: string; message_excerpt: string; reason: string; status: string; admin_note: string | null; created_at: string }[];
}

export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'students' | 'flags'>('students');
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
  return (
    <div className="space-y-6">
      <PageTitle sub={`${data.totals.students} students · ${data.totals.lessons} lessons in the curriculum · ${data.totals.openFlags} open flags`}>Admin</PageTitle>
      <div className="flex gap-2">
        <button className={tab === 'students' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('students')}>Students</button>
        <button className={tab === 'flags' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('flags')}>Flagged answers ({data.totals.openFlags})</button>
      </div>
      {tab === 'students' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>{['Name', 'Email', 'Joined', 'Courses started', 'Courses done', 'Lessons done', 'Avg quiz', 'Last active'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
