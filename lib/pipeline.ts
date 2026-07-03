import type { streamText } from "ai";
import type { HistoryTurn, SearchResult, Source } from "./types";

/**
 * FROZEN SIGNATURE (BUILD.md §6) — implementation owned by Agent A (Phase 1).
 *
 * Core per-query pipeline:
 * 1. If history is non-empty: one small LLM call rewrites the follow-up into a
 *    standalone search query (log it when NODE_ENV=development). First
 *    question skips this.
 * 2. search(query) → up to 8 SearchResults; toSources() numbers them 1..8.
 * 3. Synthesis: system prompt with numbered context block (Perplexica-style
 *    <search_results><result index=N title=...>content</result></search_results>),
 *    then history as real messages, then the user question.
 *    System prompt requires: markdown; concise; inline bare [n] citations tied
 *    to numbered sources; every factual claim cited; no fabricated citations;
 *    explicitly flag thin/conflicting sources.
 * 4. Returns the streamText result — caller merges it into a UI message stream
 *    AFTER writing the data-sources part (§6.6).
 *
 * NEVER set temperature / topP / topK (claude-sonnet-5 400s on them).
 * maxOutputTokens: generous — 8192 synthesis, 1024 rewrite.
 */
export interface PipelineInput {
  question: string;
  history: HistoryTurn[];
}

export interface PipelineRun {
  /** The query actually sent to search (rewritten when history exists). */
  searchQuery: string;
  /** Numbered sources (1-based positions) for the data part + persistence. */
  sources: Source[];
  /** Raw normalized results (for the synthesis context block). */
  results: SearchResult[];
  /** Streaming synthesis result from streamText(). */
  stream: ReturnType<typeof streamText>;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineRun> {
  // TODO(Agent A): implement per notes above.
  void input;
  throw new Error("lib/pipeline.ts not implemented yet (Phase 1, Agent A)");
}
