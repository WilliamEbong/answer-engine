import {
  MIN_VERBATIM_FIGURES,
  selfCheckSchema,
  type Briefing,
  type SelfCheckResult,
  type StageUsage,
} from "../types";
import { callStage } from "../run";

/**
 * Stage 0.5 — Briefing Self-Check (input quality gate). Tier: small.
 *
 * The LLM validates completeness (all sections non-trivial, limitations
 * non-empty, no internal contradictions) and reports failures as actionable
 * items. The ≥MIN_VERBATIM_FIGURES rule is ALSO enforced in code below —
 * never trust the model alone; either check can fail the briefing.
 */

export const SELFCHECK_SYSTEM = `You are an input quality gate for a research briefing. You decide whether the briefing carries enough grounded material to support writing multi-level explainers, and when it does not, you tell the caller EXACTLY what source material to add.

Check the briefing against these requirements:
1. COMPLETENESS. Every section must be present and non-trivial: coreFinding states a specific finding (not a vague gesture); context explains why it matters; methods says how the work was done; keyResults is non-empty; terminology and citation carry real content when the material calls for them.
2. VERBATIM GROUNDING. At least ${MIN_VERBATIM_FIGURES} keyResults must carry a concrete verbatim figure (a number, percentage, effect size, sample size, or measured quantity) in their "figure" field. Vague quantifiers ("quite a bit better", "significant") are NOT figures.
3. LIMITATIONS. The limitations array must be non-empty and substantive. A briefing with no limitations is not credible input.
4. INTERNAL CONSISTENCY. No section may contradict another (e.g. a keyResult figure that conflicts with the coreFinding, or methods that cannot produce the stated results). List every contradiction found.

Reporting rules — failures must be ACTIONABLE:
- Each missing[] item names the briefing section, describes the concrete problem, and in "whatToAdd" tells the caller exactly what SOURCE MATERIAL to supply so the problem can be fixed (e.g. "Add the paper's results section or any text containing the actual measured figures"). Never leave whatToAdd empty or generic.
- "pass" is true only when ALL four requirements hold.
- Do not invent problems: if the briefing is complete, pass it with empty missing[] and contradictions[].

Output format — respond with ONLY a JSON object matching exactly this shape (no prose, no markdown fences):
{
  "pass": boolean,
  "missing": [
    {
      "section": string,     // briefing section, e.g. "keyResults", "limitations", "methods"
      "problem": string,     // what is wrong or absent
      "whatToAdd": string    // exactly what material the caller should supply
    }
  ],
  "contradictions": [string] // each internal contradiction found; [] if none
}`;

export async function selfcheck(
  b: Briefing,
): Promise<{ result: SelfCheckResult; usage: StageUsage }> {
  const prompt = `Evaluate this research briefing against the gate requirements. JSON only.

${JSON.stringify(b, null, 2)}`;

  const { data, usage } = await callStage({
    stage: "selfcheck",
    tier: "small",
    system: SELFCHECK_SYSTEM,
    prompt,
    schema: selfCheckSchema,
    maxOutputTokens: 4096,
  });

  // Code-enforced verbatim-figure floor — the LLM verdict alone is not trusted.
  const result: SelfCheckResult = { ...data, missing: [...data.missing] };
  const verbatimCount = b.keyResults.filter((k) => k.figure.trim().length > 0).length;
  if (verbatimCount < MIN_VERBATIM_FIGURES) {
    result.pass = false;
    result.missing.push({
      section: "keyResults",
      problem: `Only ${verbatimCount} key result(s) carry a verbatim figure; at least ${MIN_VERBATIM_FIGURES} are required.`,
      whatToAdd:
        "Provide source material containing concrete figures — numbers, percentages, effect sizes, sample sizes, or other measured quantities — so key results can quote them verbatim.",
    });
  }

  return { result, usage };
}
