import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Check, Markdown, Spinner } from '../components/ui';
import { api, streamTutor, type TutorEvent } from '../lib/api';
import { useAuth } from '../lib/auth';
import { findLesson } from '../lib/curriculum';

interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
}

interface Readings {
  scripture: { reference?: string; translation?: string; verses?: { ref: string; text: string }[]; note?: string; error?: string }[];
  library: { reading: { author: string; title: string; section: string }; excerpts: { id: number; citation: string; content: string; source_url: string }[]; note?: string }[];
}

interface TutorState {
  messages: ChatMessage[];
  completedObjectives: string[];
  progress: { tutor_completed_at: string | null; quiz_passed_at: string | null; paper_passed_at: string | null; completed_at: string | null; best_quiz_score: number | null } | null;
  dailyLimit: number;
  usedToday: number;
}

export default function LessonPage() {
  const { lessonId } = useParams();
  const found = findLesson(lessonId);
  const { session } = useAuth();
  const [state, setState] = useState<TutorState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readings, setReadings] = useState<Readings | null>(null);
  const [readingsError, setReadingsError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    if (!lessonId) return;
    try {
      setState(await api<TutorState>(`/api/tutor?lessonId=${encodeURIComponent(lessonId)}`));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [lessonId]);

  useEffect(() => {
    startedRef.current = false;
    setState(null);
    setReadings(null);
    setLoadError(null);
    void load();
    if (lessonId)
      api<Readings>(`/api/readings?lessonId=${encodeURIComponent(lessonId)}`)
        .then(setReadings)
        .catch((e: Error) => setReadingsError(e.message));
  }, [lessonId, load]);

  const send = useCallback(
    async (body: { message?: string; start?: boolean }) => {
      if (!lessonId) return;
      setStreaming(true);
      setChatError(null);
      setStatus(body.start ? 'Your tutor is preparing the lesson…' : null);
      setState((s) => s && { ...s, messages: [...s.messages, ...(body.message ? [{ role: 'user' as const, content: body.message }] : []), { role: 'assistant', content: '' }] });
      const onEvent = (e: TutorEvent) => {
        if (e.t === 'text') {
          setStatus(null);
          setState((s) => {
            if (!s) return s;
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            msgs[msgs.length - 1] = { ...last, content: last.content + e.v };
            return { ...s, messages: msgs };
          });
        } else if (e.t === 'status') setStatus(e.v);
        else if (e.t === 'objective') setState((s) => s && { ...s, completedObjectives: [...new Set([...s.completedObjectives, e.id])] });
        else if (e.t === 'lesson_complete') {
          setCelebrate(true);
          setState((s) => s && { ...s, progress: { ...(s.progress ?? { quiz_passed_at: null, paper_passed_at: null, completed_at: null, best_quiz_score: null }), tutor_completed_at: new Date().toISOString() } });
        } else if (e.t === 'done')
          setState((s) => {
            if (!s) return s;
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], id: e.messageId };
            if (e.userMessageId && msgs.length >= 2) msgs[msgs.length - 2] = { ...msgs[msgs.length - 2], id: e.userMessageId };
            return { ...s, messages: msgs, usedToday: s.usedToday + (body.message ? 1 : 0) };
          });
        else if (e.t === 'error') setChatError(e.v);
      };
      try {
        await streamTutor({ lessonId, ...body }, onEvent);
      } catch (e) {
        setChatError((e as Error).message);
      } finally {
        setStreaming(false);
        setStatus(null);
        // drop an empty assistant bubble if nothing arrived
        setState((s) => {
          if (!s) return s;
          const last = s.messages[s.messages.length - 1];
          return last && last.role === 'assistant' && !last.content ? { ...s, messages: s.messages.slice(0, -1) } : s;
        });
      }
    },
    [lessonId],
  );

  // First visit: ask the tutor to open the lesson
  useEffect(() => {
    if (state && state.messages.length === 0 && !startedRef.current && !streaming) {
      startedRef.current = true;
      void send({ start: true });
    }
  }, [state, streaming, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state?.messages.length, streaming]);

  if (!found) return <Alert>Lesson not found.</Alert>;
  const { course, lesson, index } = found;
  if (loadError) return <div className="space-y-4"><Link to={`/course/${course.id}`} className="text-sm text-burgundy-700 underline">← {course.title}</Link><Alert>{loadError}</Alert></div>;
  if (!state) return <Spinner label="Opening your lesson…" />;

  const completed = new Set(state.completedObjectives);
  const tutorDone = !!state.progress?.tutor_completed_at;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void send({ message: text });
  };
  const nextLesson = course.lessons[index + 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to={`/course/${course.id}`} className="text-burgundy-700 underline">← {course.title}</Link>
        <span className="text-stone-500">Lesson {index + 1} of {course.lessons.length}</span>
      </div>
      <h1 className="font-serif text-3xl font-bold text-burgundy-800">{lesson.title}</h1>

      {/* Objectives */}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Objectives <span className="text-sm font-normal text-stone-500">({completed.size}/{lesson.objectives.length})</span></h2>
        <ul className="space-y-2">
          {lesson.objectives.map((o) => (
            <li key={o.id} className="flex gap-3"><Check done={completed.has(o.id)} /><span className={completed.has(o.id) ? 'text-stone-500' : ''}>{o.text}</span></li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {lesson.supplementary_viewing && (
            <a href={lesson.supplementary_viewing} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              ▶ Watch: Thirdmill lesson <span className="sr-only">(opens Third Millennium Ministries’ site in a new tab)</span>
            </a>
          )}
          {lesson.drill && <Link to={`/lesson/${lesson.id}/drill`} className="btn-secondary">✎ Parsing drill</Link>}
          {lesson.paper_prompt && <Link to={`/lesson/${lesson.id}/paper`} className="btn-secondary">📝 Paper{state.progress?.paper_passed_at ? ' ✓' : ''}</Link>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reading pane */}
        <section className="card flex max-h-[70vh] flex-col lg:sticky lg:top-24" aria-label="Readings">
          <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">Readings</h2>
          <div className="space-y-6 overflow-y-auto px-5 py-4">
            {readingsError && <Alert>{readingsError}</Alert>}
            {!readings && !readingsError && <Spinner label="Loading readings…" />}
            {readings?.scripture.map((p, i) => (
              <div key={i}>
                <h3 className="font-serif text-lg font-semibold">{p.reference ?? lesson.scripture_passages[i]} <span className="text-xs font-normal text-stone-500">{p.translation ?? 'BSB'}</span></h3>
                {p.error && <p className="text-sm text-red-700">{p.error}</p>}
                {p.note && <p className="text-xs text-stone-500">{p.note}</p>}
                <p className="mt-1 font-serif leading-relaxed">
                  {p.verses?.map((v) => (
                    <span key={v.ref}><sup className="mr-0.5 text-xs text-stone-400">{v.ref}</sup>{v.text} </span>
                  ))}
                </p>
              </div>
            ))}
            {readings?.library.map((r, i) => (
              <div key={i} className="border-t border-stone-100 pt-4">
                <h3 className="font-serif font-semibold">{r.reading.author}, <em>{r.reading.title}</em></h3>
                <p className="text-sm text-stone-600">Assigned: {r.reading.section}</p>
                {r.note && <p className="mt-1 text-xs text-stone-500">{r.note}</p>}
                {r.excerpts.map((x) => (
                  <details key={x.id} className="mt-2 rounded-lg bg-stone-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium">{x.citation}</summary>
                    <p className="mt-2 whitespace-pre-line font-serif text-sm leading-relaxed">{x.content}</p>
                    <a className="mt-1 inline-block text-xs text-burgundy-700 underline" href={x.source_url} target="_blank" rel="noopener noreferrer">Source</a>
                  </details>
                ))}
              </div>
            ))}
            {lesson.key_terms.length > 0 && (
              <div className="border-t border-stone-100 pt-4">
                <h3 className="font-semibold">Key terms</h3>
                <dl className="mt-2 space-y-2 text-sm">
                  {lesson.key_terms.map((k) => (
                    <div key={k.term}><dt className="font-medium">{k.term}</dt><dd className="text-stone-600">{k.definition}</dd></div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </section>

        {/* Tutor chat */}
        <section className="card flex min-h-[60vh] flex-col" aria-label="Tutor">
          <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">Your tutor</h2>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {state.messages.map((m, i) => (
              <MessageBubble key={m.id ?? `tmp${i}`} msg={m} lessonId={lesson.id} userId={session?.user.id} streaming={streaming && i === state.messages.length - 1} />
            ))}
            {status && <p className="text-sm italic text-stone-500">{status}</p>}
            {chatError && <Alert>{chatError}</Alert>}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={submit} className="border-t border-stone-200 p-3">
            <div className="flex gap-2">
              <textarea
                className="input min-h-[48px] flex-1 resize-y"
                rows={2}
                placeholder="Type your answer or question…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) submit(e);
                }}
                disabled={streaming}
                aria-label="Message to tutor"
              />
              <button className="btn-primary self-end" disabled={streaming || !input.trim()}>Send</button>
            </div>
            <p className="mt-1 text-xs text-stone-500">{Math.max(0, state.dailyLimit - state.usedToday)} messages left today · Enter to send, Shift+Enter for a new line</p>
          </form>
        </section>
      </div>

      {/* Quiz */}
      <section className="card p-5">
        <h2 className="font-semibold">Quiz</h2>
        {celebrate && <div className="mt-2"><Alert kind="success">🎉 Lesson complete! The quiz is now unlocked.</Alert></div>}
        {tutorDone ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link to={`/lesson/${lesson.id}/quiz`} className="btn-primary">{state.progress?.quiz_passed_at ? 'Retake quiz' : 'Take the quiz'}</Link>
            {state.progress?.best_quiz_score != null && <span className="text-sm text-stone-600">Best score: {Math.round(Number(state.progress.best_quiz_score))}%{state.progress.quiz_passed_at ? ' — passed ✓' : ''}</span>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">🔒 The quiz unlocks when your tutor has checked off every objective.</p>
        )}
        {state.progress?.completed_at && nextLesson && (
          <Link to={`/lesson/${nextLesson.id}`} className="btn-secondary mt-4">Next lesson: {nextLesson.title} →</Link>
        )}
      </section>

      {lesson.discussion_questions.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Discussion questions</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-serif">
            {lesson.discussion_questions.map((q) => <li key={q}>{q}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}

function MessageBubble({ msg, lessonId, userId, streaming }: { msg: ChatMessage; lessonId: string; userId?: string; streaming: boolean }) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [flagState, setFlagState] = useState<'idle' | 'sent' | 'error'>('idle');
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-burgundy-700 px-4 py-2 text-white">{msg.content}</div>
      </div>
    );
  }
  const flag = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    try {
      await api('/api/flag', { method: 'POST', body: JSON.stringify({ lessonId, messageId: msg.id ?? null, excerpt: msg.content.slice(0, 1000), reason: reason.trim() }) });
      setFlagState('sent');
      setFlagOpen(false);
    } catch {
      setFlagState('error');
    }
  };
  return (
    <div className="max-w-full">
      <div className="rounded-2xl rounded-bl-sm bg-stone-50 px-4 py-3">
        {msg.content ? <Markdown text={msg.content} className="reading prose-sm sm:prose-base" /> : <span className="text-stone-400">…</span>}
      </div>
      {!streaming && msg.content && (
        <div className="mt-1 pl-2 text-xs">
          {flagState === 'sent' ? (
            <span className="text-emerald-700">Thanks — flagged for review.</span>
          ) : (
            <button className="text-stone-500 underline hover:text-burgundy-700" onClick={() => setFlagOpen(!flagOpen)}>⚑ Report an error</button>
          )}
          {flagState === 'error' && <span className="ml-2 text-red-700">Couldn’t send the report — please try again.</span>}
          {flagOpen && (
            <form onSubmit={flag} className="mt-2 flex gap-2">
              <input className="input py-1 text-sm" placeholder="What’s wrong? (e.g. wrong verse, bad citation)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-secondary py-1">Send</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
