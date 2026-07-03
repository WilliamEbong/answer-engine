import { callStage } from "../run";
import {
  qaAResultSchema,
  type Briefing,
  type Draft,
  type ExplainerConfig,
  type QaAResult,
  type StageCallResult,
} from "../types";

/**
 * Stage 3 — QA-A (combined editorial pass, one call per level). Tier: mid.
 * maxOutputTokens: 8192 (may return a FULL corrected draft + change log).
 * Stage label `qaA:${draft.audienceKey}`. Calls run.callStage with
 * qaAResultSchema.
 *
 * Prompt rules (spec §9 / BUILD §3):
 *  - Four-dimension rubric, each scored 0–10: factual fidelity to briefing,
 *    editorial quality vs style guide, internal consistency, hype/bias.
 *  - Returns verdict 'pass' OR verdict 'corrected' with a corrected draft
 *    (full draftSchema) and a change log describing every edit.
 *  - HARD MAX one correction cycle (cfg.maxCorrectionCycles ≤ 1) — the
 *    orchestrator never loops QA-A.
 *  - JSON-only output (qaAResultSchema).
 */

export const QA_A_SYSTEM_PROMPT = `You are a senior editor running the single combined editorial QA pass on one level of a multi-level explainer. You score the draft on a four-dimension rubric and either pass it or return a fully corrected version.

RUBRIC — score each dimension 0 (unusable) to 10 (flawless):
1. "fidelity" — factual fidelity to the briefing: every claim traces to the briefing; figures quoted exactly; no outside facts; no strengthened or over-generalized claims. Hunt specifically for: causal or mechanistic explanations the briefing does not give (telltale words: "because", "likely", "probably", "due to", "suggesting that"), superlatives or comparatives the briefing does not itself make ("largest", "most", "hardest"), and characterizations that exceed the briefing's own wording. Rewrite or DELETE every such sentence — the downstream gatekeeper rejects the whole level over a single one.
2. "editorial" — editorial quality against the style guide: structure, clarity, audience fit, markdown usage.
3. "consistency" — internal consistency: title, dek, body, takeaways, and limitations agree with each other; no self-contradictions.
4. "hype" — freedom from hype and bias: 10 means neutral and honest; deduct for sensational framing, buried limitations, or promotional language.

VERDICT RULES:
- If the draft needs NO edits, return verdict "pass" with an empty "changeLog" and omit "correctedDraft".
- If the draft needs ANY edit, return verdict "corrected" with "correctedDraft" — a COMPLETE draft object (audienceKey, title, dek, bodyMarkdown, keyTakeaways, limitations), not a diff — and a "changeLog" listing EVERY edit you made, one entry per edit, stating what changed and why.
- THIS IS THE ONLY CORRECTION CYCLE. There is no second pass and no loop: fix everything fixable now. Corrections must stay strictly within the briefing's facts — never fix a problem by adding outside knowledge; if a claim exceeds the briefing, remove or weaken it to what the briefing supports.
- The corrected draft's "audienceKey" must equal the original draft's.

OUTPUT RULES:
- Respond with a single JSON object only — no prose before or after, no markdown code fences.`;

export const buildQaAPrompt = (
  b: Briefing,
  draft: Draft,
  cfg: ExplainerConfig,
): string => `Review this "${draft.audienceKey}" level draft.

RESEARCH BRIEFING (the only permitted source of facts):
${JSON.stringify(b, null, 2)}

STYLE GUIDE:
${cfg.styleGuide}

AUDIENCE PROFILE:
${JSON.stringify(cfg.audiences.find((a) => a.key === draft.audienceKey) ?? { key: draft.audienceKey }, null, 2)}

DRAFT UNDER REVIEW:
${JSON.stringify(draft, null, 2)}

Output ONLY a JSON object with this exact shape (no code fences, no commentary):
{
  "audienceKey": "${draft.audienceKey}",
  "verdict": "pass" | "corrected",
  "scores": { "fidelity": 0-10, "editorial": 0-10, "consistency": 0-10, "hype": 0-10 },
  "correctedDraft": { ...full draft object... } (ONLY when verdict is "corrected"),
  "changeLog": ["one entry per edit"] (empty array when verdict is "pass")
}`;

export async function qaA(
  b: Briefing,
  draft: Draft,
  cfg: ExplainerConfig,
): Promise<StageCallResult<QaAResult>> {
  return callStage({
    stage: `qaA:${draft.audienceKey}`,
    tier: "mid",
    system: QA_A_SYSTEM_PROMPT,
    prompt: buildQaAPrompt(b, draft, cfg),
    schema: qaAResultSchema,
    maxOutputTokens: 8192,
  });
}
