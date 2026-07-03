-- 002_explainer.sql — Explainer Engine job state (EXPLAINER-BUILD.md §6).
-- Idempotent, matching 001_init.sql conventions. Applied by scripts/migrate.ts.

create table if not exists explainer_jobs (
  id text primary key,
  thread_id uuid references threads(id) on delete set null,
  config jsonb not null,
  source_material jsonb not null,
  status text not null check (status in (
    'received','briefing_ready','rejected_input','designed','drafted',
    'qa_a_complete','approved','rejected_qa','error')),
  briefing jsonb, design jsonb, drafts jsonb, qa_a jsonb, qa_b jsonb,
  artifact jsonb, qa_report jsonb,
  usage jsonb not null default '[]'::jsonb,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_explainer_jobs_created_at_desc
  on explainer_jobs (created_at desc);

create index if not exists idx_explainer_jobs_thread_id
  on explainer_jobs (thread_id);
