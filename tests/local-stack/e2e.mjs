// End-to-end test against `netlify dev` + the local stack (see README.md in this folder).
//   node tests/local-stack/e2e.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const env = Object.fromEntries(
  readFileSync(path.join(HERE, '.env.local-stack'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SITE = process.env.SITE_URL ?? 'http://localhost:8888';
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${msg}`);
};

async function account(email, name) {
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let r = await c.auth.signUp({ email, password: 'correct-horse-9', options: { data: { full_name: name } } });
  if (r.error) r = await c.auth.signInWithPassword({ email, password: 'correct-horse-9' });
  if (r.error) throw r.error;
  const login = await c.auth.signInWithPassword({ email, password: 'correct-horse-9' });
  if (login.error) throw login.error;
  return { client: c, token: login.data.session.access_token, id: login.data.user.id };
}

async function call(token, pathname, init = {}) {
  const res = await fetch(SITE + pathname, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function tutor(token, body) {
  const res = await fetch(`${SITE}/api/tutor`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) return { status: res.status, events: [], body: JSON.parse(text) };
  const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: res.status, events, text: events.filter((e) => e.t === 'text').map((e) => e.v).join('') };
}

async function passQuiz(token, lessonId, allRight = true) {
  const start = await call(token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'start', lessonId }) });
  if (start.status !== 200) return { start };
  const { data } = await service.from('quiz_attempts').select('questions').eq('id', start.body.attemptId).single();
  const answers = {};
  for (const q of data.questions) answers[q.id] = q.type === 'multiple_choice' ? (allRight ? q.answer : (q.answer + 1) % q.options.length) : allRight ? 'A careful answer covering the key.' : 'wrong';
  const submit = await call(token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'submit', attemptId: start.body.attemptId, answers }) });
  return { start, submit };
}

const course = JSON.parse(readFileSync(path.join(HERE, '../../curriculum/t1-03-hermeneutics.json'), 'utf8'));
const stamp = Date.now();

// ---------- config & auth ----------
const cfg = await (await fetch(`${SITE}/api/config`)).json();
ok(cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.missing.length === 0, 'config endpoint returns public settings');
const home = await (await fetch(`${SITE}/attribution`)).text();
ok(home.includes('<div id="root">'), 'site serves the app shell for /attribution');
ok((await call('not-a-token', '/api/me')).status === 401, 'bad token is rejected');

const student = await account(`student${stamp}@example.com`, 'Test Student');
const me = await call(student.token, '/api/me');
ok(me.status === 200 && me.body.isAdmin === false, 'student can sign up and log in; not admin');
const prof = await student.client.from('profiles').select('full_name');
ok(prof.data?.length === 1 && prof.data[0].full_name === 'Test Student', 'profile created with name (RLS: sees only own row)');

// ---------- tutor lesson ----------
const L1 = course.lessons[0].id;
const hist0 = await call(student.token, `/api/tutor?lessonId=${L1}`);
ok(hist0.status === 200 && hist0.body.messages.length === 0, 'fresh lesson has no history');
const opening = await tutor(student.token, { lessonId: L1, start: true });
ok(opening.status === 200 && opening.text.includes('Welcome') && opening.events.some((e) => e.t === 'done'), 'tutor opens the lesson (streamed)');

const look = await tutor(student.token, { lessonId: L1, message: 'Can you show me VERSE John 3:16 in Greek?' });
ok(look.events.filter((e) => e.t === 'status').length >= 3, 'tutor used lookup tools (status events streamed)');
ok(look.text.includes('Augustine'), 'tutor answer continues after tool results');

const locked2 = await call(student.token, `/api/tutor?lessonId=${course.lessons[1].id}`);
ok(locked2.status === 403, 'lesson 2 is locked before lesson 1 is complete');
const quizEarly = await call(student.token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'start', lessonId: L1 }) });
ok(quizEarly.status === 403, 'quiz locked until tutor objectives are complete');

const done = await tutor(student.token, { lessonId: L1, message: 'I think I understand now. COMPLETE_ALL' });
ok(done.events.filter((e) => e.t === 'objective').length === course.lessons[0].objectives.length, 'all objectives marked complete by the tutor');
ok(done.events.some((e) => e.t === 'lesson_complete'), 'tutor announces lesson complete');
const hist1 = await call(student.token, `/api/tutor?lessonId=${L1}`);
ok(hist1.body.messages.length === 5 && hist1.body.progress.tutor_completed_at, 'chat history saved (resume) and tutor completion recorded');

// ---------- quiz ----------
const fail = await passQuiz(student.token, L1, false);
ok(fail.start.status === 200 && fail.start.body.questions.length === 10, 'quiz has 10 questions');
ok(fail.start.body.questions.every((q) => !('answer' in q) && !('answer_key' in q)), 'quiz questions sent without answer keys');
ok(fail.start.body.questions.some((q) => q.type === 'short_answer'), 'quiz includes short answers');
const pending = await call(student.token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'start', lessonId: L1 }) });
const hidden = await student.client.from('quiz_attempts').select('id').eq('id', pending.body.attemptId);
ok((hidden.data ?? []).length === 0, 'unsubmitted quiz (with keys) is hidden from the student by RLS');
ok(fail.submit.status === 200 && fail.submit.body.passed === false && fail.submit.body.score < 80, 'wrong answers fail the quiz');
const pass = await passQuiz(student.token, L1, true);
ok(pass.submit.body.passed === true && pass.submit.body.score === 100 && pass.submit.body.lessonCompleted === true, 'retake: correct answers pass (short answers AI-graded) and lesson completes');
const resubmit = await call(student.token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'submit', attemptId: pass.start.body.attemptId, answers: {} }) });
ok(resubmit.status === 409, 'a quiz attempt cannot be submitted twice');

const lp = await student.client.from('lesson_progress').select('lesson_id, completed_at, best_quiz_score');
ok(lp.data.length === 1 && lp.data[0].completed_at && Number(lp.data[0].best_quiz_score) === 100, 'progress updated (visible to student)');
ok((await call(student.token, `/api/tutor?lessonId=${course.lessons[1].id}`)).status === 200, 'lesson 2 unlocked after lesson 1');
ok((await call(student.token, `/api/tutor?lessonId=${course.lessons[2].id}`)).status === 403, 'lesson 3 still locked');

// forging progress directly is blocked
const forge = await student.client.from('lesson_progress').update({ completed_at: new Date().toISOString() }).eq('lesson_id', course.lessons[2].id).select();
ok(!forge.data?.length, 'student cannot forge progress through the database API');

// ---------- readings & search ----------
const readings = await call(student.token, `/api/readings?lessonId=${L1}`);
ok(readings.status === 200 && readings.body.scripture[0].verses.length > 0, 'reading pane returns BSB text');
ok(readings.body.library.length === course.lessons[0].library_readings.length, 'reading pane lists each assigned library reading');
const search = await call(student.token, '/api/search?q=faith%20and%20grace');
ok(search.status === 200 && search.body.results.length > 0 && search.body.results.every((r) => r.citation && r.source_url), 'library search returns cited results');

// ---------- history trimming & summary ----------
const L2 = course.lessons[1].id;
await tutor(student.token, { lessonId: L2, start: true });
for (let i = 0; i < 16; i++) await tutor(student.token, { lessonId: L2, message: `Answer number ${i}` });
const reqs = await (await fetch(`${env.ANTHROPIC_BASE_URL}/__requests`)).json();
const tutorReqs = reqs.filter((r) => r.tools);
ok(Math.max(...tutorReqs.map((r) => r.messages)) <= 21, 'no more than 20 history messages (+1) sent to the model');
const { data: sum } = await service.from('lesson_progress').select('chat_summary, summarized_message_count').eq('user_id', student.id).eq('lesson_id', L2).single();
ok(sum.chat_summary.length > 0 && sum.summarized_message_count > 0, 'running summary created for older messages');

// ---------- flags & rate limit ----------
const { data: lastMsg } = await service.from('chat_messages').select('id').eq('user_id', student.id).eq('role', 'assistant').order('id', { ascending: false }).limit(1).single();
const flag = await student.client.from('flags').insert({ user_id: student.id, lesson_id: L2, message_id: lastMsg.id, message_excerpt: 'x', reason: 'Wrong citation' });
ok(!flag.error, 'student can flag a tutor message');
const fakeFlag = await student.client.from('flags').insert({ user_id: '00000000-0000-0000-0000-000000000000', lesson_id: L2, reason: 'x' });
ok(!!fakeFlag.error, 'student cannot flag as someone else');

const limit = Number(env.TUTOR_DAILY_MESSAGE_LIMIT);
const { count: used } = await service.from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', student.id).eq('role', 'user');
await service.from('chat_messages').insert(Array.from({ length: limit - used }, () => ({ user_id: student.id, lesson_id: L2, role: 'user', content: 'filler' })));
const limited = await tutor(student.token, { lessonId: L2, message: 'one more' });
ok(limited.status === 429 && /limit/i.test(limited.body.error), 'daily tutor message cap enforced with a friendly message');

// ---------- admin ----------
ok((await call(student.token, '/api/admin')).status === 403, 'students cannot open the admin page');
const admin = await account(env.ADMIN_EMAIL, 'Site Admin');
for (const t of ['certificates', 'papers', 'quiz_attempts', 'objective_progress', 'lesson_progress', 'enrollments', 'chat_messages']) {
  await service.from(t).delete().eq('user_id', admin.id); // start the admin's course from scratch on every run
}
const adm = await call(admin.token, '/api/admin');
ok(adm.status === 200 && adm.body.students.length >= 2 && adm.body.flags.some((f) => f.reason === 'Wrong citation' && f.message), 'admin sees students and flagged answers');
const flagId = adm.body.flags.find((f) => f.reason === 'Wrong citation').id;
ok((await call(admin.token, '/api/admin', { method: 'POST', body: JSON.stringify({ action: 'review_flag', id: flagId, note: 'fixed' }) })).status === 200, 'admin can mark a flag reviewed');

// ---------- a whole course -> certificate (admin can open any lesson) ----------
let certificateIssued = false;
for (const lesson of course.lessons) {
  await tutor(admin.token, { lessonId: lesson.id, start: true });
  const t = await tutor(admin.token, { lessonId: lesson.id, message: 'COMPLETE_ALL' });
  if (!t.events.some((e) => e.t === 'lesson_complete')) ok(false, `tutor completion for ${lesson.id}`);
  const q = await passQuiz(admin.token, lesson.id, true);
  if (!q.submit?.body?.passed) ok(false, `quiz for ${lesson.id}: ${JSON.stringify(q.submit?.body ?? q.start.body)}`);
  if (lesson.paper_prompt) {
    const tooShort = await call(admin.token, '/api/paper', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, title: 'x', content: 'Too short.' }) });
    if (tooShort.status !== 400) ok(false, 'short paper rejected');
    const draft = await call(admin.token, '/api/paper', { method: 'PUT', body: JSON.stringify({ lessonId: lesson.id, title: 'Draft', content: 'Saving a draft.' }) });
    if (draft.status !== 200 || draft.body.paper.status !== 'draft') ok(false, 'draft saves');
    const content = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const graded = await call(admin.token, '/api/paper', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, title: 'My paper', content }) });
    ok(graded.status === 200 && graded.body.paper.status === 'graded' && graded.body.paper.scores.thesis === 4 && graded.body.paper.average === 3.8 && graded.body.passed, `paper graded against the rubric (${lesson.id}): average ${graded.body.paper.average}`);
    const again = await call(admin.token, '/api/paper', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, title: 'My paper v2', content: content + ' revised' }) });
    ok(again.body.paper.version === 2 && again.body.paper.history.length === 2, 'paper can be revised and resubmitted');
    if (graded.body.courseCompleted || again.body.courseCompleted) certificateIssued = true;
  }
  if (q.submit.body.courseCompleted) certificateIssued = true;
}
ok(certificateIssued, 'completing every lesson completes the course');
const certs = await admin.client.from('certificates').select('*');
ok(certs.data.length === 1 && certs.data[0].student_name === 'Site Admin' && certs.data[0].course_title === 'Hermeneutics', 'certificate generated with student name, course and date');
const studentCerts = await student.client.from('certificates').select('*');
ok(studentCerts.data.length === 0, "students cannot see other students' certificates");

// ---------- language drills, checked against the real STEPBible morphology ----------
for (const lessonId of ['gk1-03', 'gk2-02', 'hb1-05']) {
  const drill = await call(admin.token, `/api/drill?lessonId=${lessonId}`);
  ok(drill.status === 200 && drill.body.items.length > 0 && !JSON.stringify(drill.body.items).includes('main_morph'), `drill ${lessonId} serves real words without answers (${drill.body.items[0]?.word} ${drill.body.items[0]?.reference})`);
  const item = drill.body.items.find((i) => i.askFields.length > 0);
  const { data: w } = await service.from('original_words').select('main_morph').eq('id', item.wordId).single();
  const { data: m } = await service.from('morphology_codes').select('parsed').eq('code', w.main_morph).single();
  const right = Object.fromEntries(item.askFields.map((f) => [f, m.parsed[f]]));
  const good = await call(admin.token, '/api/drill', { method: 'POST', body: JSON.stringify({ lessonId, wordId: item.wordId, answers: right }) });
  ok(good.status === 200 && good.body.allCorrect && good.body.morphologyCode === w.main_morph, `correct parsing accepted (${w.main_morph})`);
  const f0 = item.askFields[0];
  const wrongValue = drill.body.options[f0].find((v) => v !== m.parsed[f0]) ?? 'nonsense';
  const bad = await call(admin.token, '/api/drill', { method: 'POST', body: JSON.stringify({ lessonId, wordId: item.wordId, answers: { ...right, [f0]: wrongValue } }) });
  ok(bad.status === 200 && !bad.body.allCorrect && bad.body.results.find((r) => r.field === f0)?.correct === false, `wrong ${f0} is marked wrong`);
}

console.log(`\nAll ${passed} end-to-end checks passed.`);
