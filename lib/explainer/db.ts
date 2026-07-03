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
  void input;
  throw new Error("not implemented (Agent C)");
}

export async function getJob(id: string): Promise<JobRow | null> {
  void id;
  throw new Error("not implemented (Agent C)");
}

/**
 * List recent jobs WITHOUT selecting the fat jsonb columns. Title is derived
 * from the first metadata block's content (first line, truncated ~80 chars in
 * JS); fallback "Untitled job".
 */
export async function listJobs(limit = 20): Promise<JobListItem[]> {
  void limit;
  throw new Error("not implemented (Agent C)");
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
  void id;
  void expectedStatus;
  void patch;
  throw new Error("not implemented (Agent C)");
}

export interface ThreadBundle {
  title: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  /** Deduped by url, in first-seen order. */
  sources: Array<{ url: string; title: string | null; snippet: string | null }>;
}

/**
 * pg join over threads/messages/sources (001_init schema) — the from-thread
 * bridge's read path. Lives here so Agent D never writes SQL. Returns null for
 * an unknown/invalid thread id.
 */
export async function getThreadBundle(threadId: string): Promise<ThreadBundle | null> {
  void threadId;
  throw new Error("not implemented (Agent C)");
}
