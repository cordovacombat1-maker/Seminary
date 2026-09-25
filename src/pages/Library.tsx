import { useState, type FormEvent } from 'react';
import { Alert, PageTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';

interface Hit {
  id: number;
  citation: string;
  author: string;
  title: string;
  tradition: string;
  section_ref: string;
  source_url: string;
  content: string;
  similarity: number;
}

const TRADITIONS = ['Patristic', 'Catholic', 'Lutheran', 'Reformed', 'Wesleyan', 'Anabaptist', 'Other'];

export default function LibraryPage() {
  const [q, setQ] = useState('');
  const [tradition, setTradition] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ results: Hit[]; note?: string; method: string }>(`/api/search?q=${encodeURIComponent(q)}${tradition ? `&tradition=${tradition}` : ''}`);
      setHits(r.results);
      setNote(r.note ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub="Search the public-domain library — Church Fathers, Reformers, Wesley, Aquinas, commentaries and more. Every result shows its source.">Library</PageTitle>
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <input className="input flex-1" placeholder="Key words, e.g. justification faith, Trinity persons, Eucharist sacrifice" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input sm:w-44" value={tradition} onChange={(e) => setTradition(e.target.value)} aria-label="Tradition">
          <option value="">All traditions</option>
          {TRADITIONS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-primary" disabled={busy}>Search</button>
      </form>
      {error && <Alert>{error}</Alert>}
      {busy && <Spinner label="Searching…" />}
      {note && <Alert kind="info">{note}</Alert>}
      {hits?.map((h) => (
        <article key={h.id} className="card p-5">
          <p className="text-sm font-semibold text-burgundy-800">{h.citation}</p>
          <p className="text-xs text-stone-500">{h.tradition}</p>
          <p className="mt-3 whitespace-pre-line font-serif leading-relaxed">{h.content}</p>
          <a className="mt-2 inline-block text-xs text-burgundy-700 underline" href={h.source_url} target="_blank" rel="noopener noreferrer">Source text</a>
        </article>
      ))}
    </div>
  );
}
