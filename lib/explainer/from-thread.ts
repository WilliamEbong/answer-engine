import type { SourceMaterial } from "./types";

/**
 * FROZEN SIGNATURE (EXPLAINER-BUILD.md §10 Phase 0) — implementation owned by
 * Agent D (Phase 1). Thread → job bridge (§4 from-thread.ts).
 *
 * This is HOST-APP code: the only place in lib/explainer/ allowed to trigger
 * retrieval, because enrichment happens BEFORE job submission (§1 module
 * boundary). The engine's stages/orchestrator never fetch anything.
 *
 * Implementation contract:
 *   1. db.getThreadBundle(threadId)          (pg — signature frozen in db.ts)
 *   2. enrich(bundle.sources)                (lib/search.ts — Tavily Extract + fallback)
 *   3. Build blocks:
 *      primary    → one block PER enriched source:
 *                   { role:'primary', label: title ?? url, content: text, thin }
 *      supporting → one block: the thread transcript, "Q: ...\nA: ..." turns joined
 *      metadata   → one block: thread title + numbered citation list "n. title — url"
 *   Caps: 40_000 chars per primary block, ~200_000 chars total (truncate the
 *   longest blocks first; jsonb + prompt budget).
 *
 * Returns null when the thread does not exist.
 */
export async function buildSourceMaterialFromThread(
  threadId: string,
): Promise<SourceMaterial | null> {
  void threadId;
  throw new Error("not implemented (Agent D)");
}
