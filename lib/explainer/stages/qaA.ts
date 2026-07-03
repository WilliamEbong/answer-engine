import type { Briefing, Draft, ExplainerConfig, QaAResult, StageCallResult } from "../types";

/**
 * FROZEN SIGNATURE — implementation owned by Agent B (Phase 1).
 *
 * Stage 3 — QA-A (combined editorial pass, one call per level). Tier: mid.
 * maxOutputTokens: 8192 (may return a FULL corrected draft + change log).
 * Stage label `qaA:${draft.audienceKey}`. Call via run.callStage with
 * qaAResultSchema.
 *
 * MANDATORY prompt rules (spec §9 / BUILD §3):
 *  - Four-dimension rubric, each scored 0–10: factual fidelity to briefing,
 *    editorial quality vs style guide, internal consistency, hype/bias.
 *  - Returns verdict 'pass' OR verdict 'corrected' with a corrected draft
 *    (full draftSchema) and a change log describing every edit.
 *  - HARD MAX one correction cycle (cfg.maxCorrectionCycles ≤ 1) — the
 *    orchestrator never loops QA-A.
 *  - JSON-only output (qaAResultSchema).
 */
export async function qaA(
  b: Briefing,
  draft: Draft,
  cfg: ExplainerConfig,
): Promise<StageCallResult<QaAResult>> {
  void b;
  void draft;
  void cfg;
  throw new Error("not implemented (Agent B)");
}
