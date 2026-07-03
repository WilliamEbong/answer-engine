import type { Briefing, Design, ExplainerConfig, StageCallResult } from "../types";

/**
 * FROZEN SIGNATURE — implementation owned by Agent A (Phase 1).
 *
 * Stage 1 — Instructional Design (ONE call for all levels). Tier: strong.
 * maxOutputTokens: 8192. Call via run.callStage with designSchema.
 *
 * MANDATORY prompt rules (spec §9 / BUILD §3):
 *  - Per-level learning objectives, outline, required takeaways, and which
 *    limitations each level MUST include — derived ONLY from the briefing.
 *  - Explicit per-level list of required claims/limitations.
 *  - One levels[] entry per audience in cfg.audiences, keyed by audience key.
 *  - JSON-only output (designSchema).
 *
 * CODE CHECK (not just prompt): the returned levels[].audienceKey set must
 * exactly equal the cfg.audiences key set — mismatch → StageError.
 */
export async function design(
  b: Briefing,
  cfg: ExplainerConfig,
): Promise<StageCallResult<Design>> {
  void b;
  void cfg;
  throw new Error("not implemented (Agent A)");
}
