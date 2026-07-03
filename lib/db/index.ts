import type { Source, ThreadDetail, ThreadMeta } from "../types";

/**
 * FROZEN SIGNATURES (BUILD.md §7) — implementation owned by Agent B (Phase 1).
 *
 * Runtime queries: @supabase/supabase-js with SUPABASE_SERVICE_ROLE_KEY,
 * SERVER-ONLY (never reaches the client bundle). No RLS in v1.
 * Migrations: scripts/migrate.ts over pg + DATABASE_URL (idempotent).
 *
 * Atomicity note: insertExchange persists thread (when isNewThread) + user msg
 * + assistant msg + sources atomically (§6.7). supabase-js has no client-side
 * transactions — implement via a SQL function applied in migrations/001_init.sql
 * (called with supabase.rpc) OR a pg transaction; Agent B picks one and
 * documents the choice in a comment.
 */

/** List recent threads for the home page, newest first. */
export function listThreads(limit?: number): Promise<ThreadMeta[]> {
  void limit;
  throw new Error("lib/db not implemented yet (Phase 1, Agent B)");
}

/** Load a full thread with messages and per-message sources; null if absent. */
export function getThread(id: string): Promise<ThreadDetail | null> {
  void id;
  throw new Error("lib/db not implemented yet (Phase 1, Agent B)");
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

/** Persist one Q/A exchange atomically (§6.7). */
export function insertExchange(args: InsertExchangeArgs): Promise<void> {
  void args;
  throw new Error("lib/db not implemented yet (Phase 1, Agent B)");
}
