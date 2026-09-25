import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, PageTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { findLesson } from '../lib/curriculum';

interface Q {
  id: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: string[];
}
interface Result {
  id: string;
  credit: number;
  correct: boolean;
  given: number | string | null;
  answer?: number;
  explanation?: string;
  answer_key?: string;
  feedback?: string;
}
interface Graded {
  score: number;
  passed: boolean;
  passPercent: number;
  results: Result[];
  lessonCompleted: boolean;
  courseCompleted: boolean;
}

export default function QuizPage() {
  const { lessonId } = useParams();
  const found = findLesson(lessonId);
  const [quiz, setQuiz] = useState<{ attemptId: string; questions: Q[]; passPercent: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [graded, setGraded] = useState<Graded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!found) return <Alert>Lesson not found.</Alert>;
  const { course, lesson } = found;

  const start = async () => {
    setBusy('Preparing your quiz… (the tutor is writing a few fresh questions)');
    setError(null);
    setGraded(null);
    setAnswers({});
    try {
      setQuiz(await api('/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'start', lessonId }) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const submit = async () => {
    if (!quiz) return;
    const unanswered = quiz.questions.filter((q) => answers[q.id] === undefined || answers[q.id] === '').length;
    if (unanswered && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    setBusy('Grading…');
    setError(null);
    try {
      setGraded(await api('/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'submit', attemptId: quiz.attemptId, answers }) }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const resultFor = (id: string) => graded?.results.find((r) => r.id === id);
  const nextLesson = course.lessons[found.index + 1];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={`/lesson/${lesson.id}`} className="text-sm text-burgundy-700 underline">← Back to the lesson</Link>
      <PageTitle sub={`${course.title} · 10 questions · 80% to pass · unlimited retakes`}>Quiz: {lesson.title}</PageTitle>
      {error && <Alert>{error}</Alert>}
      {busy && <Spinner label={busy} />}
      {graded && (
        <Alert kind={graded.passed ? 'success' : 'info'}>
          <p className="text-lg font-semibold">You scored {Math.round(graded.score)}% — {graded.passed ? 'passed! 🎉' : `you need ${graded.passPercent}% to pass.`}</p>
          {graded.courseCompleted && <p className="mt-1">You’ve completed the whole course! <Link className="underline" to={`/certificate/${course.id}`}>View your certificate</Link>.</p>}
          {!graded.courseCompleted && graded.lessonCompleted && nextLesson && <p className="mt-1">Lesson complete. <Link className="underline" to={`/lesson/${nextLesson.id}`}>Go to the next lesson →</Link></p>}
          {graded.passed && !graded.lessonCompleted && lesson.paper_prompt && <p className="mt-1">Next: <Link className="underline" to={`/lesson/${lesson.id}/paper`}>write the paper</Link> to finish this lesson.</p>}
          {!graded.passed && <p className="mt-1">Review the feedback below, revisit the lesson with your tutor if you like, and try again.</p>}
        </Alert>
      )}
      {!quiz && !busy && <button className="btn-primary" onClick={start}>Start the quiz</button>}
      {quiz && !busy && (
        <ol className="space-y-5">
          {quiz.questions.map((q, i) => {
            const r = resultFor(q.id);
            return (
              <li key={q.id} className={`card p-5 ${r ? (r.correct ? 'border-emerald-300' : r.credit > 0 ? 'border-amber-300' : 'border-red-300') : ''}`}>
                <p className="font-serif text-lg"><span className="text-stone-500">{i + 1}.</span> {q.question}</p>
                {q.type === 'multiple_choice' ? (
                  <div className="mt-3 space-y-2">
                    {q.options!.map((opt, oi) => {
                      const isAnswer = r && r.answer === oi;
                      const isGiven = r && r.given === oi;
                      return (
                        <label key={oi} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${isAnswer ? 'border-emerald-400 bg-emerald-50' : isGiven ? 'border-red-300 bg-red-50' : 'border-stone-200'}`}>
                          <input type="radio" name={q.id} className="mt-1" disabled={!!graded} checked={answers[q.id] === oi} onChange={() => setAnswers({ ...answers, [q.id]: oi })} />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea className="input mt-3" rows={3} disabled={!!graded} value={(answers[q.id] as string) ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer (a few sentences)" />
                )}
                {r && (
                  <div className="mt-3 text-sm text-stone-700">
                    {r.explanation && <p><strong>Explanation:</strong> {r.explanation}</p>}
                    {r.feedback && <p><strong>Feedback:</strong> {r.feedback}</p>}
                    {r.answer_key && <p className="mt-1 text-stone-500"><strong>Answer key:</strong> {r.answer_key}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {quiz && !graded && !busy && <button className="btn-primary" onClick={submit}>Submit answers</button>}
      {graded && !busy && <button className="btn-secondary" onClick={start}>Retake with new questions</button>}
    </div>
  );
}
