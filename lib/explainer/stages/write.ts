import type { Briefing, Draft, ExplainerConfig, LevelDesign, StageCallResult } from "../types";

/**
 * FROZEN SIGNATURE — implementation owned by Agent B (Phase 1).
 *
 * Stage 2 — Writer (one INDEPENDENT pass per level; orchestrator fans out
 * with Promise.all). Tier: mid. maxOutputTokens: 8192. Stage label
 * `write:${ld.audienceKey}`. Call via run.callStage with draftSchema.
 *
 * MANDATORY prompt rules (spec §9 / BUILD §3):
 *  - Receives: the briefing, THIS level's design, the audience profile, and
 *    the style guide. Levels are written natively — never summarized or
 *    expanded from each other.
 *  - NO-OUTSIDE-FACTS rule stated as INVIOLABLE: factual claims may not
 *    exceed the briefing. Analogies/framing may vary by level but must not
 *    smuggle in new factual claims.
 *  - Style guide adherence; required structural elements from the design
 *    (objectives, outline, required takeaways, required limitations).
 *  - Markdown body inside the JSON schema; JSON-only output (draftSchema).
 */
export async function write(
  b: Briefing,
  ld: LevelDesign,
  cfg: ExplainerConfig,
): Promise<StageCallResult<Draft>> {
  void b;
  void ld;
  void cfg;
  throw new Error("not implemented (Agent B)");
}
