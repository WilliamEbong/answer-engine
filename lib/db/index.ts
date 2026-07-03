import type { Source, ThreadDetail, ThreadMessage, ThreadMeta } from "../types";
import { getSupabase } from "./client";

/**
 * FROZEN SIGNATURES (BUILD.md §7) — implementation owned by Agent B (Phase 1).
 *
 * Runtime queries: @supabase/supabase-js with SUPABASE_SERVICE_ROLE_KEY,
 * SERVER-ONLY (never reaches the client bundle). No RLS in v1.
 * Migrations: scripts/migrate.ts over pg + DATABASE_URL (idempotent).
 *
 * Atomicity: insertExchange delegates to the plpgsql function
 * `insert_exchange` (migrations/001_init.sql) via supabase.rpc — a single
 * SQL function body runs in one implicit transaction. Chosen over a pg
 * transaction so the runtime path stays on supabase-js per BUILD.md §7.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SourceRow {
  position: number;
  title: string | null;
  url: string;
  snippet: string | null;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources: SourceRow[] | null;
}

interface ThreadRow {
  id: string;
  title: string;
  created_at: string;
  messages: MessageRow[] | null;
}

function toIso(ts: string): string {
  return new Date(ts).toISOString();
}

/** List recent threads for the home page, newest first. */
export async function listThreads(limit = 20): Promise<ThreadMeta[]> {
  const { data, error } = await getSupabase()
    .from("threads")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listThreads failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    createdAt: toIso(row.created_at as string),
  }));
}

/** Load a full thread with messages and per-message sources; null if absent. */
export async function getThread(id: string): Promise<ThreadDetail | null> {
  // Invalid UUIDs (e.g. a mistyped URL) mean "not found", not a 500.
  if (!UUID_RE.test(id)) return null;

  // One round trip via PostgREST embedded resources
  // (threads -> messages -> sources); ordering is normalized in JS below.
  const { data, error } = await getSupabase()
    .from("threads")
    .select(
      "id, title, created_at, messages(id, role, content, created_at, sources(position, title, url, snippet))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getThread(${id}) failed: ${error.message}`);
  }
  if (!data) return null;

  const thread = data as unknown as ThreadRow;

  const messages: ThreadMessage[] = (thread.messages ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => {
      const sources: Source[] = (m.sources ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          position: s.position,
          title: s.title,
          url: s.url,
          snippet: s.snippet,
        }));
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: toIso(m.created_at),
        sources,
      };
    });

  return {
    id: thread.id,
    title: thread.title,
    createdAt: toIso(thread.created_at),
    messages,
  };
}

export interface InsertExchangeArgs {
  /** Caller-generated UUID (crypto.randomUUID()) — sent to the client in the data-thread part. */
  threadId: string;
  /** True on the first exchange: also insert the thread row (title = truncated question). */
  isNewThread: boolean;
  /** Thread title; required when isNewThread. */
  title?: string;
  question: string;
  answer: string;
  sources: Source[];
}

/** Persist one Q/A exchange atomically (§6.7) via the insert_exchange SQL function. */
export async function insertExchange(args: InsertExchangeArgs): Promise<void> {
  const { error } = await getSupabase().rpc("insert_exchange", {
    p_thread_id: args.threadId,
    p_is_new_thread: args.isNewThread,
    p_title: args.title ?? null,
    p_question: args.question,
    p_answer: args.answer,
    // Serialized as jsonb: array of {position, title, url, snippet}.
    p_sources: args.sources,
  });

  if (error) {
    throw new Error(
      `insertExchange failed for thread ${args.threadId}: ${error.message}`,
    );
  }
}
