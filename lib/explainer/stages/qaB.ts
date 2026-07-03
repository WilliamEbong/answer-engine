import { callStage } from "../run";
import {
  MAX_QA_B_CLAIMS,
  qaBVerdictsSchema,
  type Briefing,
  type Draft,
  type ExplainerConfig,
  type QaBVerdicts,
  type StageCallResult,
} from "../types";

/**
 * Stage 4 — QA-B Source-Comparison Gatekeeper (THE authority; one call per
 * level). Tier: strong. maxOutputTokens: 8192. Stage label
 * `qaB:${draft.audienceKey}`. Calls run.callStage with qaBVerdictsSchema.
 *
 * Prompt rules (spec §9 / BUILD §3):
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

export const QA_B_SYSTEM_PROMPT = `You are the Source-Comparison Gatekeeper — the final authority on whether an explainer draft may ship. You compare the draft against the research briefing, and NOTHING else. Your own knowledge of the world is irrelevant here: a claim that is true in reality but absent from the briefing is UNSUPPORTED.

CLAIM EXTRACTION — be EXHAUSTIVE:
- Extract every substantive claim from the ENTIRE draft: the title, the dek, the body, the key takeaways, and the limitations. A substantive claim is any assertion of fact a reader could take away — findings, figures, methods, populations, mechanisms, comparisons, causal statements, and characterizations of limitations.
- Do not extract pure style, transitions, or clearly signposted analogies ("think of it like...") — but DO extract any factual assertion an analogy carries about the real world.
- Cap the list at the ${MAX_QA_B_CLAIMS} MOST SUBSTANTIVE claims. If you had to leave substantive claims out because of the cap, set "capped": true; otherwise set it false.

PER-CLAIM VERDICT — judged against the briefing ONLY:
- "supported": the briefing states this, with matching strength and exact figures. "evidence" must quote or precisely cite the part of the briefing that supports it.
- "unsupported": the claim (or its specificity) does not appear in the briefing. "evidence" must explain what is missing from the briefing.
- "distorted": the underlying fact IS in the briefing, but the draft's framing misleads — rounded or altered figures, correlation presented as causation, hedged findings presented as settled, a subgroup result generalized, a limitation softened, or hype the briefing does not license. "evidence" must quote the briefing and explain the mismatch. DISTORTED COUNTS AS FAILURE — a technically-true-but-misleading claim is a rejection, not a pass.

OUTPUT RULES:
- Respond with a single JSON object only — no prose before or after, no markdown code fences.`;

const LENIENT_NOTE = `
LENIENT MODE: this job runs with lenient strictness. If — and only if — a claim is not in the briefing but the draft CLEARLY flags it as background context rather than a finding (e.g. "for context, ...", "as general background, ..."), you may set "flaggedContext": true on that claim (its verdict stays "unsupported"). Never set flaggedContext on a "distorted" claim, and never for unflagged statements.`;

const STRICT_NOTE = `
STRICT MODE: this job runs with strict strictness. Do not set "flaggedContext" — every claim must be fully supported by the briefing to pass.`;

export const buildQaBPrompt = (
  b: Briefing,
  draft: Draft,
  cfg: ExplainerConfig,
): string => `Gatekeep this "${draft.audienceKey}" level draft against the briefing.
${cfg.strictness === "lenient" ? LENIENT_NOTE : STRICT_NOTE}

RESEARCH BRIEFING (the ONLY ground truth):
${JSON.stringify(b, null, 2)}

FINAL DRAFT (extract claims from title, dek, bodyMarkdown, keyTakeaways, AND limitations):
${JSON.stringify(draft, null, 2)}

Output ONLY a JSON object with this exact shape (no code fences, no commentary):
{
  "audienceKey": "${draft.audienceKey}",
  "claims": [
    {
      "claim": "the claim as asserted by the draft",
      "verdict": "supported" | "unsupported" | "distorted",
      "evidence": "briefing quote/citation, or explanation of the failure",
      "flaggedContext": true (optional; lenient mode only, per the rules above)
    }
  ],
  "capped": true | false
}`;

export async function qaB(
  b: Briefing,
  draft: Draft,
  cfg: ExplainerConfig,
): Promise<StageCallResult<QaBVerdicts>> {
  return callStage({
    stage: `qaB:${draft.audienceKey}`,
    tier: "strong",
    system: QA_B_SYSTEM_PROMPT,
    prompt: buildQaBPrompt(b, draft, cfg),
    schema: qaBVerdictsSchema,
    maxOutputTokens: 8192,
  });
}

/**
 * Pure pass/fail computation — NEVER delegated to the model.
 * strict: every claim must be 'supported'.
 * lenient: 'unsupported' claims with flaggedContext=true are tolerated;
 * 'distorted' always fails.
 */
export function levelPasses(v: QaBVerdicts, strictness: "strict" | "lenient"): boolean {
  return v.claims.every((c) => {
    if (c.verdict === "supported") return true;
    if (c.verdict === "distorted") return false;
    return strictness === "lenient" && c.flaggedContext === true;
  });
}
