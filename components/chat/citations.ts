import type { Source } from "@/lib/types";

/** DOM id of a source card — citation chips hash-link to this. */
export function sourceAnchorId(msgId: string, position: number): string {
  return `source-${msgId}-${position}`;
}

/** Hostname without leading "www." — used for labels and favicons. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(url))}&sz=32`;
}

/**
 * Rewrite bare [n] citation markers in raw markdown into hash-links that
 * target the matching source card: "[1]" -> "[1](#source-{msgId}-1)".
 * Only positions that exist in `sources` are rewritten; anything else is left
 * untouched. Already-linked "[n](" occurrences are skipped via the lookahead.
 */
export function linkifyCitations(
  markdown: string,
  msgId: string,
  sources: Source[] | undefined
): string {
  if (!sources || sources.length === 0) return markdown;
  const valid = new Set(sources.map((s) => s.position));
  return markdown.replace(/\[(\d{1,2})\](?!\()/g, (match, num: string) => {
    const n = Number(num);
    return valid.has(n) ? `[${num}](#${sourceAnchorId(msgId, n)})` : match;
  });
}
