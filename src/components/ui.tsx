import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, type ReactNode } from 'react';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-stone-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-burgundy-700" />
      {label}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

marked.setOptions({ breaks: true, gfm: true });

export function Markdown({ text, className = 'reading' }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
  }, [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" aria-label={`${pct}% complete`}>
      <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-burgundy-800 sm:text-4xl">{children}</h1>
      {sub && <p className="mt-2 text-stone-600">{sub}</p>}
    </div>
  );
}

export const Check = ({ done }: { done: boolean }) => (
  <span
    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 bg-white text-transparent'}`}
    aria-label={done ? 'complete' : 'not complete'}
  >
    ✓
  </span>
);
