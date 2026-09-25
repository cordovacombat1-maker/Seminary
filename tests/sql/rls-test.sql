-- Verifies Row Level Security: each student sees only their own rows and cannot forge grades.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"full_name":"Student A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"full_name":"Student B"}');
insert into public.chat_messages (user_id, lesson_id, role, content) values
  ('00000000-0000-0000-0000-00000000000a', 'l1', 'user', 'A says hi'),
  ('00000000-0000-0000-0000-00000000000b', 'l1', 'user', 'B says hi');
insert into public.quiz_attempts (user_id, course_id, lesson_id, questions, submitted_at) values
  ('00000000-0000-0000-0000-00000000000a', 'c', 'l1', '[]', now()),
  ('00000000-0000-0000-0000-00000000000a', 'c', 'l1', '[{"answer":"secret"}]', null);
insert into public.bible_verses values ('BSB','Jhn',3,16,'For God so loved the world...');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'profiles leak'; end if;
  if (select full_name from public.profiles) <> 'Student A' then raise exception 'profile trigger failed'; end if;
  if (select count(*) from public.chat_messages) <> 1 then raise exception 'chat leak'; end if;
  if (select count(*) from public.quiz_attempts) <> 1 then raise exception 'unsubmitted quiz visible'; end if;
  if (select count(*) from public.bible_verses) <> 1 then raise exception 'cannot read verses'; end if;
end $$;

-- may rename self
update public.profiles set full_name = 'A. Student';
-- may not write grades, chat, or progress directly
do $$ begin
  begin
    insert into public.quiz_attempts (user_id, course_id, lesson_id, questions, score, passed, submitted_at)
      values ('00000000-0000-0000-0000-00000000000a', 'c', 'l1', '[]', 100, true, now());
    raise exception 'student forged a quiz attempt';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.certificates (user_id, course_id, student_name, course_title)
      values ('00000000-0000-0000-0000-00000000000a', 'c', 'x', 'y');
    raise exception 'student forged a certificate';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set email = 'evil@example.com';
    raise exception 'student changed email column';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.flags (user_id, lesson_id, reason) values ('00000000-0000-0000-0000-00000000000b', 'l1', 'x');
    raise exception 'student flagged as someone else';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.flags (user_id, lesson_id, reason) values ('00000000-0000-0000-0000-00000000000a', 'l1', 'wrong date');

reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.bible_verses;
    raise exception 'anon can read data';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'RLS_OK';
