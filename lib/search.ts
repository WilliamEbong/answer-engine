import type { SearchResult } from "./types";
import { getEnv } from "./env";

/**
 * FROZEN SIGNATURE (BUILD.md §2, §6.3) — implementation owned by Agent A (Phase 1).
 *
 * v1 provider: Tavily via plain REST fetch (no SDK), search_depth "advanced",
 * up to 8 results, normalized to SearchResult. Tavily response types NEVER
 * leak outside this module.
 */
export class SearchError extends Error {}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const MAX_RESULTS = 8;

/** Private Tavily wire types — never exported (provider types must not leak). */
interface TavilyResultItem {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilyResponse {
  results?: TavilyResultItem[];
}

/** Tavily rejects very short queries — pad to its 5-char minimum (per Morphic). */
function normalizeQuery(query: string): string {
  const q = query.trim();
  return q.length < 5 ? q + " ".repeat(5 - q.length) : q;
}

async function tavilyFetch(query: string): Promise<TavilyResponse> {
  const env = getEnv();
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      max_results: MAX_RESULTS,
      search_depth: "advanced",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Tavily responded with ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }
  return (await res.json()) as TavilyResponse;
}

/**
 * Web search: returns up to 8 normalized results. Retries once on network
 * failure or a non-2xx response, then throws SearchError (BUILD.md §11.3 —
 * caller renders an inline error card).
 */
export async function search(query: string): Promise<SearchResult[]> {
  const q = normalizeQuery(query);

  let response: TavilyResponse;
  try {
    response = await tavilyFetch(q);
  } catch {
    // One retry, then surface a readable error.
    try {
      response = await tavilyFetch(q);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new SearchError(`Web search failed after retry: ${detail}`);
    }
  }

  const raw = Array.isArray(response.results) ? response.results : [];
  return raw
    .filter((r): r is TavilyResultItem & { url: string } => typeof r.url === "string" && r.url.length > 0)
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: r.title ?? "",
      url: r.url,
      content: r.content ?? "",
    }));
}
