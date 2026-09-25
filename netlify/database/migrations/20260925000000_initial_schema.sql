-- Seminary app: initial schema for Netlify Database.
-- Netlify applies this automatically on deploy. There is nothing to run by hand.
-- The browser never talks to the database directly: every read and write goes through the
-- Netlify Functions, which check who is logged in and only ever touch that student's rows.

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  password_hash text not null,        -- scrypt, never the password itself
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index users_email on public.users (lower(email));

create table public.sessions (
  token_hash text primary key,        -- sha256 of the login token; the token itself is only in the browser
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on public.sessions (user_id);

-- ---------------------------------------------------------------------------
-- Student data
-- ---------------------------------------------------------------------------

create table public.enrollments (
  user_id uuid not null references public.users (id) on delete cascade,
  course_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);

create table public.lesson_progress (
  user_id uuid not null references public.users (id) on delete cascade,
  course_id text not null,
  lesson_id text not null,
  tutor_completed_at timestamptz,
  quiz_passed_at timestamptz,
  best_quiz_score numeric,
  paper_passed_at timestamptz,
  completed_at timestamptz,
  chat_summary text not null default '',
  summarized_message_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_activity on public.lesson_progress (user_id, last_activity_at desc);

create table public.objective_progress (
  user_id uuid not null references public.users (id) on delete cascade,
  lesson_id text not null,
  objective_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id, objective_id)
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  lesson_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread on public.chat_messages (user_id, lesson_id, created_at);
create index chat_messages_daily on public.chat_messages (user_id, role, created_at);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  course_id text not null,
  lesson_id text not null,
  questions jsonb not null,          -- includes answer keys; hidden from the student until submitted
  answers jsonb,
  results jsonb,
  score numeric,
  passed boolean,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index quiz_attempts_user on public.quiz_attempts (user_id, lesson_id, created_at desc);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  course_id text not null,
  lesson_id text not null,
  title text not null default '',
  prompt text not null default '',
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'graded')),
  scores jsonb,                       -- { thesis: 1-5, exegesis: 1-5, sources: 1-5, reasoning: 1-5, clarity: 1-5 }
  average numeric,
  feedback text,
  version integer not null default 0, -- number of times graded
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (user_id, lesson_id)
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  course_id text not null,
  student_name text not null,
  course_title text not null,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table public.flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  lesson_id text not null,
  message_id bigint references public.chat_messages (id) on delete set null,
  message_excerpt text not null default '',
  reason text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed')),
  admin_note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reference data (loaded from the Admin page -> "Load texts")
-- ---------------------------------------------------------------------------

create table public.bible_verses (
  translation text not null,          -- 'BSB' | 'KJV' | 'WEB'
  book text not null,                 -- STEPBible code: Gen, Exo, ..., Mat, Mrk, Jhn, ...
  chapter integer not null,
  verse integer not null,
  text text not null,
  primary key (translation, book, chapter, verse)
);

create table public.original_words (
  id bigint generated always as identity primary key,
  language text not null check (language in ('greek', 'hebrew')),
  book text not null,
  chapter integer not null,
  verse integer not null,
  word_num integer not null,
  word text not null,
  translit text,
  english text,
  strongs text,                       -- full dStrongs tag (Hebrew may contain prefixes, e.g. H9003/{H7225G})
  main_strongs text,                  -- the main word's Strong's number, e.g. H7225G / G0976
  grammar text,                       -- full grammar tag, e.g. N-NSF or HR/Ncfsa
  main_morph text,                    -- full morphology code of the main word, e.g. N-NSF or HNcfsa
  lemma text,
  gloss text,
  editions text,                      -- Greek: which editions include the word (NKO etc.)
  alt_ref text,                       -- Hebrew versification when it differs from English
  unique (language, book, chapter, verse, word_num)
);
create index original_words_ref on public.original_words (book, chapter, verse, word_num);
create index original_words_strongs on public.original_words (main_strongs);
create index original_words_morph on public.original_words (language, main_morph);

create table public.lexicon (
  strongs text primary key,           -- e.g. G0976, H1254A
  language text not null check (language in ('greek', 'hebrew')),
  lemma text not null,
  translit text,
  morph text,
  gloss text,
  definition text
);

create table public.morphology_codes (
  code text primary key,              -- e.g. V-PAI-3S or HVqp3ms
  language text not null check (language in ('greek', 'hebrew')),
  description text not null,          -- raw "Function=Verb; Tense=Present; ..." line
  parsed jsonb not null,              -- { "Function": "Verb", "Tense": "Present", ... }
  summary text,
  explanation text
);

create table public.proper_names (
  id bigint generated always as identity primary key,
  name text not null,
  strongs text,
  kind text,                          -- person / place / other
  description text,
  references_text text
);
create index proper_names_name on public.proper_names (lower(name));
create index proper_names_strongs on public.proper_names (strongs);

create table public.library_chunks (
  id bigint generated always as identity primary key,
  work_id text not null,              -- a work id from shared/library.ts, or the volume id if the work couldn't be identified
  volume_id text not null,            -- the downloaded file this chunk came from
  author text not null,
  title text not null,
  tradition text not null check (tradition in ('Patristic', 'Catholic', 'Lutheran', 'Reformed', 'Wesleyan', 'Anabaptist', 'Other')),
  section_ref text not null default '',
  source_url text not null,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  unique (volume_id, chunk_index)
);
create index library_chunks_work on public.library_chunks (work_id);
create index library_chunks_volume on public.library_chunks (volume_id, chunk_index);
create index library_chunks_tsv on public.library_chunks using gin (content_tsv);

-- ---------------------------------------------------------------------------
-- Search helpers (called by the Netlify Functions)
-- ---------------------------------------------------------------------------

-- Keyword search over the library: passages containing all the words first, then any of them.
create or replace function public.keyword_library_chunks(
  query_text text,
  match_count integer default 6,
  tradition_filter text default null,
  work_filter text[] default null
)
returns table (
  id bigint, work_id text, author text, title text, tradition text,
  section_ref text, source_url text, content text, similarity double precision
)
language plpgsql stable
set search_path = public
as $$
declare
  q tsquery := websearch_to_tsquery('english', query_text);
begin
  return query
    select c.id, c.work_id, c.author, c.title, c.tradition, c.section_ref, c.source_url, c.content,
           ts_rank_cd(c.content_tsv, q)::double precision
    from public.library_chunks c
    where c.content_tsv @@ q
      and (tradition_filter is null or c.tradition = tradition_filter)
      and (work_filter is null or c.work_id = any (work_filter) or c.volume_id = any (work_filter))
    order by 9 desc
    limit least(match_count, 20);
  if not found then
    q := nullif(replace(plainto_tsquery('english', query_text)::text, ' & ', ' | '), '')::tsquery;
    if q is null then
      return;
    end if;
    return query
      select c.id, c.work_id, c.author, c.title, c.tradition, c.section_ref, c.source_url, c.content,
             ts_rank_cd(c.content_tsv, q)::double precision
      from public.library_chunks c
      where c.content_tsv @@ q
        and (tradition_filter is null or c.tradition = tradition_filter)
        and (work_filter is null or c.work_id = any (work_filter) or c.volume_id = any (work_filter))
      order by 9 desc
      limit least(match_count, 20);
  end if;
end;
$$;

-- Random words for parsing drills, filtered by morphology-code patterns (SQL LIKE)
create or replace function public.random_drill_words(
  lang text,
  morph_patterns text[],
  books text[] default null,
  n integer default 10
)
returns setof public.original_words
language sql volatile
set search_path = public
as $$
  select w.*
  from public.original_words w
  join public.morphology_codes m on m.code = w.main_morph
  where w.language = lang
    and w.main_morph like any (morph_patterns)
    and (books is null or w.book = any (books))
    and (lang <> 'greek' or w.editions ~ '[NK]')
  order by random()
  limit least(n, 30);
$$;


-- Progress of the one-time text loading run from the Admin page
create table public.load_steps (
  id text primary key,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  detail text not null default '',
  rows_loaded integer not null default 0,
  updated_at timestamptz not null default now()
);
