import type { Briefing, SourceMaterial, StageCallResult } from "../types";

/**
 * FROZEN SIGNATURE — implementation owned by Agent A (Phase 1).
 *
 * Stage 0 — Briefing Compiler (restructure only, NO retrieval). Tier: small.
 * maxOutputTokens: 8192. Call via run.callStage with briefingSchema.
 *
 * MANDATORY prompt rules (spec §9 / BUILD §3):
 *  - Restructure-only: may reorganize and condense, may NEVER add claims
 *    absent from the input.
 *  - Key results quote figures/numbers VERBATIM with their location in the
 *    source (section/paragraph description).
 *  - Limitations section is mandatory (extract what the input states or
 *    implies; never invent).
 *  - Output schema = briefingSchema; JSON-only output, no prose, no fences.
 *
 * Prompt lives in this file as an exported const (no shared prompts module).
 */
export async function compile(sm: SourceMaterial): Promise<StageCallResult<Briefing>> {
  void sm;
  throw new Error("not implemented (Agent A)");
}
