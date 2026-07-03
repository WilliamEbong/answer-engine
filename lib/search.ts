import type { SearchResult } from "./types";

/**
 * FROZEN SIGNATURE (BUILD.md §2, §6.3) — implementation owned by Agent A (Phase 1).
 *
 * v1 provider: Tavily via plain REST fetch (no SDK), search_depth "advanced",
 * up to 8 results, normalized to SearchResult. Tavily response types NEVER
 * leak outside this module.
 *
 * Implementation notes (from Morphic recon):
 * - POST https://api.tavily.com/search with
 *   { api_key, query, max_results: 8, search_depth: "advanced" }.
 * - Pad queries shorter than 5 chars (Tavily minimum).
 * - Retry once on failure, then throw a SearchError (§11.3 — caller renders
 *   an inline error card).
 */
export class SearchError extends Error {}

export async function search(query: string): Promise<SearchResult[]> {
  // TODO(Agent A): implement per notes above.
  throw new SearchError("lib/search.ts not implemented yet (Phase 1, Agent A)");
}
