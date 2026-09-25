// End-to-end test against `netlify dev` + the local stack (see README.md in this folder).
//   node tests/local-stack/e2e.mjs
import pg from 'pg';
import { execSync } from 'node:child_process';
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
// Direct database access, standing in for "looking behind the scenes" in the tests
// `netlify dev` runs Netlify's local database; ask the CLI where it is.
const dbUrl = process.env.E2E_DB_URL ?? JSON.parse(execSync('netlify database status --show-credentials --json', { encoding: 'utf8' })).database.connectionString;
const pool = new pg.Pool({ connectionString: dbUrl });
const sql = async (text, params = []) => (await pool.query(text, params)).rows;

let passed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${msg}`);
};

const PASSWORD = 'correct-horse-9';

async function account(email, name) {
  let r = await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'signup', email, password: PASSWORD, fullName: name }) });
  if (r.status !== 200) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
  const login = await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email, password: PASSWORD }) });
  if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return { token: login.body.token, id: login.body.user.id, user: login.body.user };
}

async function call(token, pathname, init = {}) {
  const res = await fetch(SITE + pathname, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
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
  const [data] = await sql('select questions from quiz_attempts where id = $1', [start.body.attemptId]);
  const answers = {};
  for (const q of data.questions) answers[q.id] = q.type === 'multiple_choice' ? (allRight ? q.answer : (q.answer + 1) % q.options.length) : allRight ? 'A careful answer covering the key.' : 'wrong';
  const submit = await call(token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'submit', attemptId: start.body.attemptId, answers }) });
  return { start, submit };
}

const course = JSON.parse(readFileSync(path.join(HERE, '../../curriculum/t1-03-hermeneutics.json'), 'utf8'));
const stamp = Date.now();

// ---------- setup, config & accounts (expects a freshly created database) ----------
const cfg0 = await (await fetch(`${SITE}/api/config`)).json();
ok(cfg0.database && cfg0.ai && !cfg0.hasAccounts && !cfg0.textsLoaded, 'config: database and AI ready, no accounts or texts yet');
const home = await (await fetch(`${SITE}/attribution`)).text();
ok(home.includes('<div id="root">'), 'site serves the app shell for /attribution');
ok((await call('not-a-token', '/api/me')).status === 401, 'bad token is rejected');

const admin = await account(`admin${stamp}@example.com`, 'Site Admin');
ok(admin.user.isAdmin === true, 'the first account to sign up becomes the administrator');
const student = await account(`student${stamp}@example.com`, 'Test Student');
const me = await call(student.token, '/api/me');
ok(me.status === 200 && me.body.isAdmin === false && me.body.fullName === 'Test Student', 'student can sign up and log in; not admin');
const dup = await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'signup', email: `STUDENT${stamp}@example.com`, password: PASSWORD, fullName: 'X' }) });
ok(dup.status === 409, 'duplicate email (any capitalisation) is refused');
const wrong = await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email: `student${stamp}@example.com`, password: 'nope-nope-nope' }) });
ok(wrong.status === 401 && /don’t match/.test(wrong.body.error), 'wrong password is refused with a friendly message');
const [stored] = await sql('select password_hash from users where id = $1', [student.id]);
ok(stored.password_hash.startsWith('scrypt$') && !stored.password_hash.includes(PASSWORD), 'passwords are stored hashed, never in plain text');
const [sess] = await sql('select token_hash from sessions where user_id = $1 limit 1', [student.id]);
ok(sess.token_hash !== student.token && /^[0-9a-f]{64}$/.test(sess.token_hash), 'login tokens are stored only as hashes');
ok((await call(student.token, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'update_name', fullName: 'Test Student' }) })).status === 200, 'student can update their name');

// ---------- loading texts (Admin page -> Load texts) ----------
ok((await call(student.token, '/api/admin')).status === 403, 'students cannot open the admin page');
const status0 = await call(admin.token, '/api/admin');
ok(status0.status === 200 && status0.body.loading.length > 60 && status0.body.loading.every((s) => s.status === 'pending'), 'admin sees every text-loading step, none loaded yet');
for (const step of status0.body.loading.filter((s) => s.group === 'Bible' || s.group === 'Greek & Hebrew')) {
  const r = await call(admin.token, '/api/admin', { method: 'POST', body: JSON.stringify({ action: 'load', step: step.id }) });
  ok(r.status === 200 && r.body.step.status === 'done', `loaded ${step.label}: ${r.body.step?.detail}`);
}
const again = await call(admin.token, '/api/admin', { method: 'POST', body: JSON.stringify({ action: 'load', step: 'bible-kjv' }) });
ok(again.body.step.status === 'done', 're-running a finished step is safe (skipped)');
const [counts] = await sql(`select (select count(*) from bible_verses)::int as verses, (select count(*) from original_words)::int as words,
  (select count(*) from lexicon)::int as lex, (select count(*) from morphology_codes)::int as morph`);
ok(counts.verses > 93000 && counts.words > 440000 && counts.lex > 15000 && counts.morph > 1000, `texts loaded: ${JSON.stringify(counts)}`);
const manual = await call(admin.token, '/api/admin', { method: 'POST', body: JSON.stringify({ action: 'load', step: 'library-keil-delitzsch' }) });
ok(manual.body.step.status === 'skipped', 'books with no free online copy are skipped with an explanation');
const cfg1 = await (await fetch(`${SITE}/api/config`)).json();
ok(cfg1.hasAccounts && cfg1.textsLoaded, 'config reports accounts and texts');
// The sandbox cannot reach Gutenberg/CCEL, so stand-in library passages are inserted directly
// (the real chunking code is covered by the unit tests).
for (let i = 0; i < 5; i++) {
  await sql(
    `insert into library_chunks (work_id, volume_id, author, title, tradition, section_ref, source_url, chunk_index, content, token_count)
     values ('augustine-christian-doctrine', 'npnf102', 'Augustine', 'On Christian Doctrine', 'Patristic', $1, 'https://ccel.org/ccel/schaff/npnf102', $2, $3, 100)`,
    [`Book II > Chapter ${i + 1}`, i, `Stand-in passage ${i} on faith and grace, the rule of faith and charity in interpreting Scripture. Hermeneutics and interpretation of obscure passages by clearer ones.`],
  );
}

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
ok(pending.status === 200 && !JSON.stringify(pending.body).includes('answer_key'), 'a new quiz attempt never sends answer keys to the browser');
ok(fail.submit.status === 200 && fail.submit.body.passed === false && fail.submit.body.score < 80, 'wrong answers fail the quiz');
const pass = await passQuiz(student.token, L1, true);
ok(pass.submit.body.passed === true && pass.submit.body.score === 100 && pass.submit.body.lessonCompleted === true, 'retake: correct answers pass (short answers AI-graded) and lesson completes');
const resubmit = await call(student.token, '/api/quiz', { method: 'POST', body: JSON.stringify({ action: 'submit', attemptId: pass.start.body.attemptId, answers: {} }) });
ok(resubmit.status === 409, 'a quiz attempt cannot be submitted twice');

const lp = await call(student.token, '/api/progress?transcript=1');
ok(lp.body.lessons.length === 1 && lp.body.lessons[0].completed_at && lp.body.lessons[0].best_quiz_score === 100, 'progress updated (visible to student)');
ok(lp.body.quizzes.length === 2 && lp.body.quizzes.every((q) => q.submitted_at), 'transcript lists only submitted quizzes');
ok((await call(student.token, `/api/tutor?lessonId=${course.lessons[1].id}`)).status === 200, 'lesson 2 unlocked after lesson 1');
ok((await call(student.token, `/api/tutor?lessonId=${course.lessons[2].id}`)).status === 403, 'lesson 3 still locked');

const adminProgress = await call(admin.token, '/api/progress');
ok(adminProgress.body.lessons.length === 0, "one student's progress is never shown to another account");

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
const [sum] = await sql('select chat_summary, summarized_message_count from lesson_progress where user_id = $1 and lesson_id = $2', [student.id, L2]);
ok(sum.chat_summary.length > 0 && sum.summarized_message_count > 0, 'running summary created for older messages');

// ---------- flags & rate limit ----------
const [lastMsg] = await sql("select id from chat_messages where user_id = $1 and role = 'assistant' order by id desc limit 1", [student.id]);
const flag = await call(student.token, '/api/flag', { method: 'POST', body: JSON.stringify({ lessonId: L2, messageId: lastMsg.id, reason: 'Wrong citation' }) });
ok(flag.status === 200, 'student can flag a tutor message');
await tutor(admin.token, { lessonId: L2, start: true });
const [adminMsg] = await sql("select id from chat_messages where user_id = $1 and role = 'assistant' order by id desc limit 1", [admin.id]);
await call(student.token, '/api/flag', { method: 'POST', body: JSON.stringify({ lessonId: L2, messageId: adminMsg.id, excerpt: 'x', reason: 'probe' }) });
const [probe] = await sql("select message_id from flags where reason = 'probe'");
ok(probe.message_id === null, "a student cannot attach someone else's message to a flag");

const limit = Number(env.TUTOR_DAILY_MESSAGE_LIMIT);
const [{ n: used }] = await sql("select count(*)::int as n from chat_messages where user_id = $1 and role = 'user'", [student.id]);
await sql("insert into chat_messages (user_id, lesson_id, role, content) select $1, $2, 'user', 'filler' from generate_series(1, $3)", [student.id, L2, limit - used]);
const limited = await tutor(student.token, { lessonId: L2, message: 'one more' });
ok(limited.status === 429 && /limit/i.test(limited.body.error), 'daily tutor message cap enforced with a friendly message');

// ---------- admin ----------
const adm = await call(admin.token, '/api/admin');
ok(adm.status === 200 && adm.body.students.length === 2 && adm.body.flags.some((f) => f.reason === 'Wrong citation' && f.message), 'admin sees students and flagged answers');
const flagId = adm.body.flags.find((f) => f.reason === 'Wrong citation').id;
ok((await call(admin.token, '/api/admin', { method: 'POST', body: JSON.stringify({ action: 'review_flag', id: flagId, note: 'fixed' }) })).status === 200, 'admin can mark a flag reviewed');
const reset = await call(admin.token, '/api/admin', { method: 'POST', body: JSON.stringify({ action: 'reset_password', userId: student.id }) });
ok(reset.status === 200 && /^[a-z]+-[a-z]+-\d{4}$/.test(reset.body.password), 'admin can set a temporary password for a student');
ok((await call(student.token, '/api/me')).status === 401, "a password reset logs the student out everywhere");
const oldLogin = await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email: `student${stamp}@example.com`, password: PASSWORD }) });
const tempLogin = await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email: `student${stamp}@example.com`, password: reset.body.password }) });
ok(oldLogin.status === 401 && tempLogin.status === 200, 'the old password stops working and the temporary one works');
student.token = tempLogin.body.token;
const change = await call(student.token, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'change_password', currentPassword: reset.body.password, newPassword: PASSWORD }) });
ok(change.status === 200, 'student can change their password');
const out = await call(student.token, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
ok(out.status === 200 && (await call(student.token, '/api/me')).status === 401, 'logging out ends the session');
student.token = (await call(null, '/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email: `student${stamp}@example.com`, password: PASSWORD }) })).body.token;

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
const certs = (await call(admin.token, '/api/progress')).body.certificates;
ok(certs.length === 1 && certs[0].student_name === 'Site Admin' && certs[0].course_title === 'Hermeneutics' && certs[0].issued_at, 'certificate generated with student name, course and date');
const studentCerts = (await call(student.token, '/api/progress')).body.certificates;
ok(studentCerts.length === 0, "students cannot see other students' certificates");

// ---------- language drills, checked against the real STEPBible morphology ----------
for (const lessonId of ['gk1-03', 'gk2-02', 'hb1-05']) {
  const drill = await call(admin.token, `/api/drill?lessonId=${lessonId}`);
  ok(drill.status === 200 && drill.body.items.length > 0 && !JSON.stringify(drill.body.items).includes('main_morph'), `drill ${lessonId} serves real words without answers (${drill.body.items[0]?.word} ${drill.body.items[0]?.reference})`);
  const item = drill.body.items.find((i) => i.askFields.length > 0);
  const [w] = await sql('select main_morph from original_words where id = $1', [item.wordId]);
  const [m] = await sql('select parsed from morphology_codes where code = $1', [w.main_morph]);
  const right = Object.fromEntries(item.askFields.map((f) => [f, m.parsed[f]]));
  const good = await call(admin.token, '/api/drill', { method: 'POST', body: JSON.stringify({ lessonId, wordId: item.wordId, answers: right }) });
  ok(good.status === 200 && good.body.allCorrect && good.body.morphologyCode === w.main_morph, `correct parsing accepted (${w.main_morph})`);
  const f0 = item.askFields[0];
  const wrongValue = drill.body.options[f0].find((v) => v !== m.parsed[f0]) ?? 'nonsense';
  const bad = await call(admin.token, '/api/drill', { method: 'POST', body: JSON.stringify({ lessonId, wordId: item.wordId, answers: { ...right, [f0]: wrongValue } }) });
  ok(bad.status === 200 && !bad.body.allCorrect && bad.body.results.find((r) => r.field === f0)?.correct === false, `wrong ${f0} is marked wrong`);
}

console.log(`\nAll ${passed} end-to-end checks passed.`);
await pool.end();
