import { Pool } from "pg";
import { getEnv } from "../env";
import type {
  Artifact,
  Briefing,
  Design,
  Draft,
  ExplainerConfig,
  JobError,
  JobListItem,
  JobReport,
  JobRow,
  JobStatus,
  QaAResult,
  QaBVerdicts,
  SourceMaterial,
  StageUsage,
} from "./types";

/**
 * FROZEN SIGNATURES (EXPLAINER-BUILD.md §10 Phase 0) — implementation owned by
 * Agent C (Phase 1). Explainer data layer: pg over DATABASE_URL (locked owner
 * decision — NOT supabase-js; SUPABASE_* env vars are optional for this module).
 * Server-only — never import from client components.
 *
 * CRITICAL pg gotcha: node-pg serializes a top-level JS ARRAY parameter as a
 * Postgres array literal, not JSON. Every jsonb parameter (config,
 * source_material, drafts, qa_a, qa_b, usage append, ...) MUST be passed as
 * JSON.stringify(value) with an explicit ::jsonb cast in the SQL. Stringify
 * objects too, for uniformity.
 */

let pool: Pool | undefined;

/** Module-scoped pool: reused across warm serverless invocations; safe for CLI. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Supabase pooler (matches scripts/migrate.ts)
      max: 3, // serverless spawns many instances — keep per-instance small
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true, // lets scripts/explain.ts & gates exit without pool.end()
    });
  }
  return pool;
}

/** All columns of explainer_jobs, as node-pg returns them (jsonb pre-parsed, timestamptz as Date). */
interface RawJobRow {
  id: string;
  thread_id: string | null;
  config: ExplainerConfig;
  source_material: SourceMaterial;
  status: JobStatus;
  briefing: Briefing | null;
  design: Design | null;
  drafts: Draft[] | null;
  qa_a: QaAResult[] | null;
  qa_b: QaBVerdicts[] | null;
  artifact: Artifact | null;
  qa_report: JobReport | null;
  usage: StageUsage[];
  last_error: JobError | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: RawJobRow): JobRow {
  return {
    id: r.id,
    thread_id: r.thread_id,
    config: r.config,
    source_material: r.source_material,
    status: r.status,
    briefing: r.briefing,
    design: r.design,
    drafts: r.drafts,
    qa_a: r.qa_a,
    qa_b: r.qa_b,
    artifact: r.artifact,
    qa_report: r.qa_report,
    usage: r.usage ?? [],
    last_error: r.last_error,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

export interface CreateJobInput {
  id: string;
  threadId: string | null;
  config: ExplainerConfig;
  sourceMaterial: SourceMaterial;
}

/**
 * Idempotent create: INSERT with status 'received' ON CONFLICT (id) DO NOTHING,
 * then SELECT the row unconditionally. created = the INSERT inserted a row.
 * Resubmission with an existing id returns the existing job untouched.
 */
export async function createJob(input: CreateJobInput): Promise<{ job: JobRow; created: boolean }> {
  const insert = await getPool().query(
    `insert into explainer_jobs (id, thread_id, config, source_material, status)
     values ($1, $2, $3::jsonb, $4::jsonb, 'received')
     on conflict (id) do nothing`,
    [input.id, input.threadId, JSON.stringify(input.config), JSON.stringify(input.sourceMaterial)],
  );
  const created = insert.rowCount === 1;
  const job = await getJob(input.id);
  if (!job) {
    // Only possible if the row was deleted between INSERT and SELECT.
    throw new Error(`explainer job ${input.id} vanished after insert`);
  }
  return { job, created };
}

export async function getJob(id: string): Promise<JobRow | null> {
  const res = await getPool().query<RawJobRow>(
    "select * from explainer_jobs where id = $1",
    [id],
  );
  if (res.rowCount === 0) return null;
  return mapRow(res.rows[0]);
}

/**
 * List recent jobs WITHOUT selecting the fat jsonb columns. Title is derived
 * from the first metadata block's content (first line, truncated ~80 chars in
 * JS); fallback "Untitled job".
 */
export async function listJobs(limit = 20): Promise<JobListItem[]> {
  const res = await getPool().query<{
    id: string;
    thread_id: string | null;
    status: JobStatus;
    title_raw: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `select id, thread_id, status, created_at, updated_at,
            (select left(b->>'content', 200)
               from jsonb_array_elements(source_material->'blocks') b
              where b->>'role' = 'metadata'
              limit 1) as title_raw
       from explainer_jobs
      order by created_at desc
      limit $1`,
    [limit],
  );
  return res.rows.map((r) => {
    const firstLine = (r.title_raw ?? "")
      .split(/\r?\n/, 1)[0]
      .replace(/^#+\s*/, "")
      .trim();
    const title = firstLine ? firstLine.slice(0, 80) : "Untitled job";
    return {
      id: r.id,
      thread_id: r.thread_id,
      status: r.status,
      title,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    };
  });
}

export interface JobWavePatch {
  status: JobStatus;
  briefing?: Briefing;
  design?: Design;
  drafts?: Draft[];
  qa_a?: QaAResult[];
  qa_b?: QaBVerdicts[];
  artifact?: Artifact;
  qa_report?: JobReport;
  /** null explicitly clears last_error after a successful resume. */
  last_error?: JobError | null;
  /** Appended to the usage jsonb array: usage = usage || $n::jsonb. */
  usageAppend?: StageUsage[];
}

const JSONB_PATCH_COLUMNS = [
  "briefing",
  "design",
  "drafts",
  "qa_a",
  "qa_b",
  "artifact",
  "qa_report",
] as const;

/**
 * The single checkpoint write: ONE dynamic UPDATE setting the given columns,
 * usage = usage || $n::jsonb (append, never overwrite), updated_at = now(),
 * WHERE id = $1 AND status = $2 RETURNING *.
 *
 * Returns null when rowCount = 0 (a concurrent advance won the optimistic
 * guard) — the caller re-fetches instead of writing.
 */
export async function updateJobWave(
  id: string,
  expectedStatus: JobStatus,
  patch: JobWavePatch,
): Promise<JobRow | null> {
  const values: unknown[] = [id, expectedStatus];
  const sets: string[] = [];
  const add = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}::jsonb`);
  };

  values.push(patch.status);
  sets.push(`status = $${values.length}`);

  for (const col of JSONB_PATCH_COLUMNS) {
    const v = patch[col];
    if (v !== undefined) add(col, JSON.stringify(v));
  }

  if (patch.last_error === null) {
    sets.push("last_error = NULL");
  } else if (patch.last_error !== undefined) {
    add("last_error", JSON.stringify(patch.last_error));
  }

  if (patch.usageAppend !== undefined && patch.usageAppend.length > 0) {
    values.push(JSON.stringify(patch.usageAppend));
    sets.push(`usage = usage || $${values.length}::jsonb`);
  }

  sets.push("updated_at = now()");

  const res = await getPool().query<RawJobRow>(
    `update explainer_jobs
        set ${sets.join(", ")}
      where id = $1 and status = $2
      returning *`,
    values,
  );
  if (res.rowCount === 0) return null;
  return mapRow(res.rows[0]);
}

export interface ThreadBundle {
  title: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  /** Deduped by url, in first-seen order. */
  sources: Array<{ url: string; title: string | null; snippet: string | null }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * pg join over threads/messages/sources (001_init schema) — the from-thread
 * bridge's read path. Lives here so Agent D never writes SQL. Returns null for
 * an unknown/invalid thread id.
 */
export async function getThreadBundle(threadId: string): Promise<ThreadBundle | null> {
  // Reject non-UUID ids up front — an invalid uuid literal makes pg throw.
  if (!UUID_RE.test(threadId)) return null;

  const p = getPool();
  const threadRes = await p.query<{ title: string }>(
    "select title from threads where id = $1",
    [threadId],
  );
  if (threadRes.rowCount === 0) return null;

  const [messagesRes, sourcesRes] = await Promise.all([
    p.query<{ role: "user" | "assistant"; content: string }>(
      `select role, content
         from messages
        where thread_id = $1
        order by created_at asc`,
      [threadId],
    ),
    p.query<{ url: string; title: string | null; snippet: string | null }>(
      `select s.url, s.title, s.snippet
         from sources s
         join messages m on m.id = s.message_id
        where m.thread_id = $1
        order by m.created_at asc, s.position asc`,
      [threadId],
    ),
  ]);

  const seen = new Set<string>();
  const sources: ThreadBundle["sources"] = [];
  for (const s of sourcesRes.rows) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    sources.push(s);
  }

  return {
    title: threadRes.rows[0].title,
    turns: messagesRes.rows.map((m) => ({ role: m.role, content: m.content })),
    sources,
  };
}
