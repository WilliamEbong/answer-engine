import { generateText, streamText } from "ai";
import { getModel } from "./llm";
import { search } from "./search";
import { toSources, type HistoryTurn, type SearchResult, type Source } from "./types";

/**
 * FROZEN SIGNATURE (BUILD.md §6) — implementation owned by Agent A (Phase 1).
 *
 * Core per-query pipeline:
 * 1. If history is non-empty: one small LLM call rewrites the follow-up into a
 *    standalone search query (log it when NODE_ENV=development). First
 *    question skips this.
 * 2. search(query) → up to 8 SearchResults; toSources() numbers them 1..8.
 * 3. Synthesis: system prompt with numbered context block, then history as
 *    real messages, then the user question.
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

const REWRITE_SYSTEM_PROMPT = `Rephrase the user's last query into a self-contained, context-independent search query that can be understood without prior conversation context. Example: if the conversation is about cars and the user asks "How do they work", output "How do cars work?". Do not include everything discussed before; be concise. Output ONLY the rewritten query, no quotes, no explanations.`;

/** Rewrite a follow-up question into a standalone search query. */
async function rewriteQuery(question: string, history: HistoryTurn[]): Promise<string> {
  const flattened = history
    .map((t) => `${t.role === "user" ? "User" : "AI"}: ${t.content}`)
    .join("\n");

  const { text } = await generateText({
    model: getModel(),
    system: REWRITE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<conversation_history>\n${flattened}\n</conversation_history>\n\n<user_query>\n${question}\n</user_query>`,
      },
    ],
    maxOutputTokens: 1024,
  });

  const rewritten = text.trim();
  if (!rewritten) throw new Error("query rewrite returned empty text");
  return rewritten;
}

function buildSynthesisSystemPrompt(sources: Source[], results: SearchResult[]): string {
  const resultBlocks = sources
    .map((s, i) => {
      const content = results[i]?.content ?? s.snippet ?? "";
      const title = (s.title ?? "").replace(/"/g, "&quot;");
      return `<result index=${s.position} title="${title}">${content}</result>`;
    })
    .join("\n");

  return `You are an expert answer engine. You write accurate, well-structured markdown answers grounded in the numbered web sources provided below.

# Citation Requirements
- Cite every factual claim or sentence with inline bare [n] notation tied to the numbered sources. Place citations at the end of the sentence or clause, with no space before the bracket, e.g. "...in the world[1]."
- Cite multiple sources for one claim as adjacent brackets, e.g. "...as reported[1][2]."
- NEVER fabricate a citation or cite a source number that does not exist in the list below.
- If no source supports a statement, say so explicitly instead of citing.
- Explicitly flag thin, low-quality, or conflicting sources when you rely on them.

# Style
- Concise, well-structured markdown.
- Give the direct answer first; no preamble, no restating the question.
- Use headings, lists, or tables only when they genuinely aid readability.

# When sources are irrelevant or empty
If the search results are empty or none of them are relevant to the question, say so transparently and suggest how the user might reframe their question. Do not invent an answer.

<search_results note="numbered sources the assistant cites as [n]">
${resultBlocks}
</search_results>`;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineRun> {
  const { question, history } = input;

  // 1. Query rewrite (follow-ups only). On failure, fall back to the raw
  //    question — search must still run.
  let searchQuery = question;
  if (history.length > 0) {
    try {
      searchQuery = await rewriteQuery(question, history);
      if (process.env.NODE_ENV === "development") {
        console.log("[pipeline] rewritten query:", searchQuery);
      }
    } catch (err) {
      console.warn(
        "[pipeline] query rewrite failed; falling back to the raw question:",
        err instanceof Error ? err.message : err,
      );
      searchQuery = question;
    }
  }

  // 2. Web search → numbered sources.
  const results = await search(searchQuery);
  const sources = toSources(results);

  // 3. Streaming synthesis. History as real turns; the final user message is
  //    the ORIGINAL question (not the rewritten search query).
  const stream = streamText({
    model: getModel(),
    system: buildSynthesisSystemPrompt(sources, results),
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: question },
    ],
    maxOutputTokens: 8192,
  });

  return { searchQuery, sources, results, stream };
}
