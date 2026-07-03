import { designSchema, type Briefing, type Design, type ExplainerConfig, type StageCallResult } from "../types";
import { callStage, StageError } from "../run";

/**
 * Stage 1 — Instructional Design (ONE call for all levels). Tier: strong.
 *
 * From the briefing plus the audience profiles, produces per-level learning
 * objectives, an outline, required takeaways, and which briefing limitations
 * each level must include — derived ONLY from the briefing. A code check
 * verifies the returned audienceKey set exactly matches cfg.audiences.
 */

export const DESIGN_SYSTEM = `You are an instructional designer. Given a research briefing and a set of audience profiles, you produce ONE instructional design per audience level — all levels in a single response.

Inviolable rules:
1. BRIEFING-ONLY. Learning objectives, outline items, required takeaways, and required limitations must be derived ONLY from the briefing. Never introduce facts, framings, or limitations the briefing does not contain.
2. ONE ENTRY PER AUDIENCE. levels[] must contain exactly one entry per audience profile provided, with "audienceKey" set to that audience's exact key string — no extras, no omissions, no renaming.
3. PER-LEVEL FIT. Tailor depth and sequencing to each audience's description and tone: objectives state what THAT reader should be able to understand or do after reading; the outline orders sections for that reader; takeaways phrase the briefing's substance at that reader's level.
4. REQUIRED LIMITATIONS. For each level, list which of the briefing's limitations that level's explainer MUST include, quoting or closely paraphrasing the briefing's own limitations. Deeper audiences must carry more (the advanced level should carry all substantive ones); no level may carry zero unless the briefing itself lists no limitations.
5. REQUIRED TAKEAWAYS are the claims that level's draft must convey — each must trace to the briefing's coreFinding or keyResults.

Output format — respond with ONLY a JSON object matching exactly this shape (no prose, no markdown fences):
{
  "levels": [
    {
      "audienceKey": string,           // the audience's exact key
      "learningObjectives": [string],  // at least one; derived from the briefing
      "outline": [string],             // at least one; ordered section plan for the draft
      "requiredTakeaways": [string],   // at least one; claims the draft must convey
      "requiredLimitations": [string]  // briefing limitations this level must include
    }
  ]
}`;

export async function design(
  b: Briefing,
  cfg: ExplainerConfig,
): Promise<StageCallResult<Design>> {
  const audiences = cfg.audiences
    .map(
      (a) =>
        `- key: ${a.key}\n  displayName: ${a.displayName}\n  reader: ${a.description}\n  tone: ${a.tone}`,
    )
    .join("\n");

  const prompt = `Produce the instructional design for every audience level below. One levels[] entry per audience, keyed by its exact key. Derive everything from the briefing only. JSON only.

AUDIENCE PROFILES (${cfg.audiences.length}):
${audiences}

RESEARCH BRIEFING:
${JSON.stringify(b, null, 2)}`;

  const { data, usage } = await callStage({
    stage: "design",
    tier: "strong",
    system: DESIGN_SYSTEM,
    prompt,
    schema: designSchema,
    maxOutputTokens: 8192,
  });

  // Code check: returned audienceKey set must exactly equal the config's key set.
  const expected = new Set(cfg.audiences.map((a) => a.key));
  const returned = new Set(data.levels.map((l) => l.audienceKey));
  const missing = [...expected].filter((k) => !returned.has(k));
  const extra = [...returned].filter((k) => !expected.has(k));
  if (missing.length > 0 || extra.length > 0 || returned.size !== data.levels.length) {
    throw new StageError(
      "design",
      `levels[].audienceKey mismatch: missing [${missing.join(", ")}], unexpected [${extra.join(", ")}], duplicates: ${data.levels.length - returned.size}`,
    );
  }

  return { data, usage };
}
