import { enrich } from "../search";
import { getThreadBundle } from "./db";
import { sourceMaterialSchema, type SourceBlock, type SourceMaterial } from "./types";

/**
 * Thread → job bridge (EXPLAINER-BUILD.md §4 from-thread.ts).
 *
 * This is HOST-APP code: the only place in lib/explainer/ allowed to trigger
 * retrieval, because enrichment happens BEFORE job submission (§1 module
 * boundary). The engine's stages/orchestrator never fetch anything.
 *
 * Blocks built here:
 *   primary    → one block PER enriched source (full text; `thin` marks
 *                snippet-only fallbacks — Stage 0.5 arbitrates)
 *   supporting → the thread transcript ("Q: ...\nA: ..." turns joined)
 *   metadata   → thread title + numbered citation list "n. title — url"
 *
 * Caps (jsonb + prompt budget): 40_000 chars per primary block; ~200_000
 * chars total — the longest primary blocks are truncated first, never below
 * a floor, then the supporting transcript.
 *
 * Returns null when the thread does not exist.
 */

const PRIMARY_BLOCK_CAP = 40_000;
const TOTAL_CONTENT_CAP = 200_000;
/** Never truncate a block below this many chars — keep every source represented. */
const TRUNCATION_FLOOR = 1_000;

export async function buildSourceMaterialFromThread(
  threadId: string,
): Promise<SourceMaterial | null> {
  const bundle = await getThreadBundle(threadId);
  if (!bundle) return null;

  const enriched = await enrich(bundle.sources);

  const blocks: SourceBlock[] = [];

  // Primary: one block per enriched source; skip sources with no text at all.
  for (const source of enriched) {
    const content = source.text.slice(0, PRIMARY_BLOCK_CAP);
    if (content.length === 0) continue;
    blocks.push({
      role: "primary",
      label: source.title || source.url,
      content,
      thin: source.thin,
    });
  }

  // Supporting: the thread's Q&A transcript.
  const transcript = bundle.turns
    .map((t) => `${t.role === "user" ? "Q" : "A"}: ${t.content}`)
    .join("\n");
  if (transcript.trim().length > 0) {
    blocks.push({ role: "supporting", label: "Thread Q&A", content: transcript });
  }

  // Metadata: thread title + numbered citation list.
  const citations = bundle.sources
    .map((s, i) => `${i + 1}. ${s.title ?? s.url} — ${s.url}`)
    .join("\n");
  const metadata = [bundle.title.trim(), citations].filter((s) => s.length > 0).join("\n\n");
  if (metadata.trim().length > 0) {
    blocks.push({ role: "metadata", label: "Thread metadata", content: metadata });
  }

  enforceTotalCap(blocks);

  return sourceMaterialSchema.parse({ blocks });
}

/**
 * Bring total content under TOTAL_CONTENT_CAP by truncating the longest
 * primary blocks first (down to TRUNCATION_FLOOR each), then the supporting
 * transcript. Mutates `blocks` in place.
 */
function enforceTotalCap(blocks: SourceBlock[]): void {
  let excess = blocks.reduce((n, b) => n + b.content.length, 0) - TOTAL_CONTENT_CAP;
  if (excess <= 0) return;

  for (const role of ["primary", "supporting"] as const) {
    while (excess > 0) {
      let idx = -1;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.role !== role || b.content.length <= TRUNCATION_FLOOR) continue;
        if (idx === -1 || b.content.length > blocks[idx].content.length) idx = i;
      }
      if (idx === -1) break; // every block of this role is at the floor
      const block = blocks[idx];
      const cut = Math.min(excess, block.content.length - TRUNCATION_FLOOR);
      block.content = block.content.slice(0, block.content.length - cut);
      excess -= cut;
    }
    if (excess <= 0) return;
  }
}
