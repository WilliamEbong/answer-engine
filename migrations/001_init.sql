-- 001_init.sql — answer-engine initial schema (BUILD.md §7).
-- Fully idempotent: safe to re-run any number of times.

-- ---------------------------------------------------------------------------
-- Tables (BUILD.md §7, verbatim)
-- ---------------------------------------------------------------------------

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  position int not null,
  title text,
  url text not null,
  snippet text
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_messages_thread_id_created_at
  on messages (thread_id, created_at);

create index if not exists idx_sources_message_id
  on sources (message_id);

create index if not exists idx_threads_created_at_desc
  on threads (created_at desc);

-- ---------------------------------------------------------------------------
-- insert_exchange — atomicity helper (BUILD.md §6.7 / §7).
--
-- supabase-js has no client-side transactions, so the whole Q/A exchange is
-- persisted inside this single plpgsql function (one implicit transaction):
--   1. optionally the thread row (first exchange of a new thread),
--   2. the user message,
--   3. the assistant message,
--   4. the assistant message's sources (jsonb array of
--      {position, title, url, snippet}).
-- Called from lib/db via supabase.rpc('insert_exchange', {...}).
-- No `security definer` needed: the service-role key bypasses RLS anyway.
-- ---------------------------------------------------------------------------

create or replace function insert_exchange(
  p_thread_id uuid,
  p_is_new_thread boolean,
  p_title text,
  p_question text,
  p_answer text,
  p_sources jsonb
) returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_assistant_message_id uuid;
begin
  if p_is_new_thread then
    insert into threads (id, title, created_at)
    values (p_thread_id, coalesce(p_title, left(p_question, 80)), v_now);
  end if;

  insert into messages (thread_id, role, content, created_at)
  values (p_thread_id, 'user', p_question, v_now);

  -- +1ms keeps user/assistant ordering deterministic under
  -- `order by created_at asc` (now() is fixed for the whole transaction).
  insert into messages (thread_id, role, content, created_at)
  values (p_thread_id, 'assistant', p_answer, v_now + interval '1 millisecond')
  returning id into v_assistant_message_id;

  insert into sources (message_id, position, title, url, snippet)
  select
    v_assistant_message_id,
    (s ->> 'position')::int,
    nullif(s ->> 'title', ''),
    s ->> 'url',
    nullif(s ->> 'snippet', '')
  from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) as s;
end;
$$;
