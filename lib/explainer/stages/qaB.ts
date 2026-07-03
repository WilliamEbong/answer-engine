import type { Briefing, Draft, ExplainerConfig, QaBVerdicts, StageCallResult } from "../types";

/**
 * FROZEN SIGNATURES — implementation owned by Agent B (Phase 1).
 *
 * Stage 4 — QA-B Source-Comparison Gatekeeper (THE authority; one call per
 * level). Tier: strong. maxOutputTokens: 8192. Stage label
 * `qaB:${draft.audienceKey}`. Call via run.callStage with qaBVerdictsSchema.
 *
 * MANDATORY prompt rules (spec §9 / BUILD §3):
 *  - EXHAUSTIVE claim extraction: every substantive claim in the final draft
 *    (cap at the MAX_QA_B_CLAIMS=40 most substantive; set capped=true when
 *    truncated — §9.4).
 *  - Per-claim verdict against the briefing ONLY: supported | unsupported |
 *    distorted, each citing briefing evidence (or explaining the failure).
 *  - DISTORTED (correct fact, misleading framing) COUNTS AS FAILURE.
 *  - Lenient mode: clearly-flagged context statements may set
 *    flaggedContext=true (levelPasses tolerates them); strict ignores it.
 *  - JSON-only output (qaBVerdictsSchema).
 */
export async function qaB(
  b: Briefing,
  draft: Draft,
  cfg: ExplainerConfig,
): Promise<StageCallResult<QaBVerdicts>> {
  void b;
  void draft;
  void cfg;
  throw new Error("not implemented (Agent B)");
}

/**
 * Pure pass/fail computation — NEVER delegated to the model.
 * strict: every claim must be 'supported'.
 * lenient: 'unsupported' claims with flaggedContext=true are tolerated;
 * 'distorted' always fails.
 */
export function levelPasses(v: QaBVerdicts, strictness: "strict" | "lenient"): boolean {
  void v;
  void strictness;
  throw new Error("not implemented (Agent B)");
}
