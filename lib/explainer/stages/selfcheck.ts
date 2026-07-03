import type { Briefing, SelfCheckResult, StageUsage } from "../types";

/**
 * FROZEN SIGNATURE — implementation owned by Agent A (Phase 1).
 *
 * Stage 0.5 — Briefing Self-Check (input quality gate). Tier: small.
 * maxOutputTokens: 4096. Call via run.callStage with selfCheckSchema.
 *
 * MANDATORY rules (spec §3 Stage 0.5 / BUILD §3):
 *  - Validate completeness: all sections present and non-trivial,
 *    limitations non-empty, no internal contradictions.
 *  - ≥ MIN_VERBATIM_FIGURES (3) verbatim-grounded figures/claims is ALSO
 *    enforced IN CODE here (count briefing.keyResults with non-empty figure) —
 *    never trust the model alone; either the code check or the LLM check can
 *    fail the briefing.
 *  - Failure report must be ACTIONABLE: each missing[] item names the
 *    section, the problem, and exactly what material to add (G1 asserts
 *    non-empty whatToAdd on every item).
 *  - JSON-only output (selfCheckSchema).
 */
export async function selfcheck(
  b: Briefing,
): Promise<{ result: SelfCheckResult; usage: StageUsage }> {
  void b;
  throw new Error("not implemented (Agent A)");
}
