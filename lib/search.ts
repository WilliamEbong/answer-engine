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

// ---------------------------------------------------------------------------
// enrich() — full-page content for the explainer thread→job bridge
// (EXPLAINER-BUILD.md §2 "Enrichment", §9.1 fallback). Called only by
// lib/explainer/from-thread.ts, never by the engine's stages/orchestrator.
// ---------------------------------------------------------------------------

const TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";
/** Below this many chars the page text is considered thin and the snippet wins. */
const THIN_TEXT_CHARS = 500;
const FALLBACK_FETCH_TIMEOUT_MS = 10_000;

export interface EnrichedSource {
  url: string;
  title: string;
  text: string;
  /** true = full text unavailable (paywalled/blocked); `text` is the snippet. */
  thin: boolean;
}

/** Private Tavily Extract wire types — never exported. */
interface TavilyExtractItem {
  url?: string;
  raw_content?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractItem[];
}

async function tavilyExtract(urls: string[]): Promise<Map<string, string>> {
  const env = getEnv();
  const res = await fetch(TAVILY_EXTRACT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.TAVILY_API_KEY, urls }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Tavily Extract responded with ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }
  const data = (await res.json()) as TavilyExtractResponse;
  const byUrl = new Map<string, string>();
  for (const item of data.results ?? []) {
    if (typeof item.url === "string" && typeof item.raw_content === "string") {
      byUrl.set(item.url, item.raw_content);
    }
  }
  return byUrl;
}

/** Naive HTML→text: strip script/style, tags, decode common entities (§9.1 — no new dependency). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FALLBACK_FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; answer-engine/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return htmlToText(await res.text());
}

/**
 * Enrich sources to full-page text via Tavily Extract; per-URL fallback is a
 * direct fetch + HTML-to-text. Pages that stay short (paywalled/blocked) keep
 * their snippet and are marked thin — Stage 0.5 arbitrates (§9.1). Never throws:
 * worst case every source comes back thin with its snippet.
 */
export async function enrich(
  sources: Array<{ url: string; title?: string | null; snippet?: string | null }>,
): Promise<EnrichedSource[]> {
  if (sources.length === 0) return [];
  const urls = sources.map((s) => s.url);

  let extracted = new Map<string, string>();
  try {
    extracted = await tavilyExtract(urls);
  } catch {
    try {
      extracted = await tavilyExtract(urls);
    } catch {
      // Fall through — per-URL direct fetch below.
    }
  }

  return Promise.all(
    sources.map(async (s): Promise<EnrichedSource> => {
      let text = extracted.get(s.url) ?? "";
      if (text.length < THIN_TEXT_CHARS) {
        try {
          const fetched = await fetchPageText(s.url);
          if (fetched.length > text.length) text = fetched;
        } catch {
          // keep whatever we have
        }
      }
      const thin = text.length < THIN_TEXT_CHARS;
      return {
        url: s.url,
        title: s.title ?? s.url,
        text: thin ? (s.snippet ?? text) : text,
        thin,
      };
    }),
  );
}
