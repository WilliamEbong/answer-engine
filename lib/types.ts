import type { UIMessage } from "ai";

/**
 * FROZEN CONTRACTS (BUILD.md §12 Phase 0).
 * Only the main agent may amend this file. All Phase-1 agents compile against it.
 */

/** Normalized web search result. Provider (Tavily) types never leak past lib/search.ts. */
export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

/** A cited source as shown in the UI and persisted in the `sources` table. */
export interface Source {
  /** 1-based citation number — matches inline [n] markers in the answer. */
  position: number;
  title: string | null;
  url: string;
  snippet: string | null;
}

/** Thread list item for the home page. */
export interface ThreadMeta {
  id: string;
  title: string;
  /** ISO 8601 */
  createdAt: string;
}

/** One persisted message within a thread. */
export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** ISO 8601 */
  createdAt: string;
  /** Sources cited by an assistant message; empty for user messages. */
  sources: Source[];
}

/** Full thread as loaded by /t/[id]. */
export interface ThreadDetail extends ThreadMeta {
  messages: ThreadMessage[];
}

/** Plain conversation history handed to the pipeline (no UI parts). */
export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Typed AI SDK v6 data parts streamed by POST /api/chat.
 * - `data-sources`: full source list, sent BEFORE token streaming begins (BUILD.md §6.6).
 * - `data-thread`: thread id, sent early so the client can navigate/persist (§8).
 */
export type AnswerDataParts = {
  sources: Source[];
  thread: { id: string };
};

/** The UIMessage type used by useChat on the client and by the chat route. */
export type AnswerUIMessage = UIMessage<never, AnswerDataParts>;

/** Request body accepted by POST /api/chat (BUILD.md §6.1). */
export interface ChatRequestBody {
  threadId?: string;
  question: string;
}

/** Convert a SearchResult list (max 8) to numbered Sources. */
export function toSources(results: SearchResult[]): Source[] {
  return results.map((r, i) => ({
    position: i + 1,
    title: r.title || null,
    url: r.url,
    snippet: r.content ? r.content.slice(0, 300) : null,
  }));
}

/** Thread titles are the truncated first question (BUILD.md §2 — no extra LLM call). */
export function titleFromQuestion(question: string): string {
  const t = question.trim().replace(/\s+/g, " ");
  return t.length <= 80 ? t : t.slice(0, 77) + "...";
}
