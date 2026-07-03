import { briefingSchema, type Briefing, type SourceMaterial, type StageCallResult } from "../types";
import { callStage } from "../run";

/**
 * Stage 0 — Briefing Compiler (restructure only, NO retrieval). Tier: small.
 *
 * Normalizes raw source material into the Research Briefing schema. The
 * compiler may reorganize and condense, never add claims absent from the
 * input; figures are quoted verbatim with their source location, and the
 * limitations section is mandatory (extracted, never invented).
 */

export const COMPILE_SYSTEM = `You are a research briefing compiler. You restructure source material into a fixed briefing schema. You are a RESTRUCTURING tool, not an author.

Inviolable rules:
1. RESTRUCTURE ONLY. You may reorganize, condense, and deduplicate. You may NEVER add a claim, fact, figure, interpretation, or implication that is not present in the source material. If the input does not state something, the briefing does not state it.
2. VERBATIM FIGURES. Every key result must quote its figure/number as a VERBATIM substring of the source material — copy the exact characters, including units, percent signs, confidence intervals, and p-values. Do not round, reformat, or paraphrase figures. Each key result records WHERE in the source the figure appears (section name or paragraph description).
3. MANDATORY LIMITATIONS. Extract every limitation the source states or clearly implies. If the source contains no limitations, return an empty array — NEVER invent limitations to fill the section.
4. NO ENRICHMENT. Do not supply background knowledge, definitions the source does not give, or a citation the source does not contain. Missing material stays missing — a downstream gate handles incomplete briefings.

Some source blocks may be marked THIN, meaning only a snippet was available, not the full text. Treat thin blocks as incomplete evidence: use what they say, but do not extrapolate beyond their literal content.

Output format — respond with ONLY a JSON object matching exactly this shape (no prose, no markdown fences, nothing before or after the JSON):
{
  "coreFinding": string,       // the single central finding/claim of the material, in one or two sentences
  "context": string,           // why it matters / background, as stated in the source
  "methods": string,           // how the work was done, condensed from the source
  "keyResults": [              // every substantive quantitative result in the source
    {
      "claim": string,         // the result in plain language
      "figure": string,        // the figure/number quoted VERBATIM from the source
      "location": string       // where it appears (e.g. "Results section, second paragraph")
    }
  ],
  "limitations": [string],     // limitations stated or implied by the source; [] if none
  "openQuestions": [string],   // open questions stated by the source; [] if none
  "terminology": [             // terms the source defines or that need definition, with the source's definitions
    { "term": string, "definition": string }
  ],
  "citation": string           // citation block from the source metadata; "" if none given
}`;

/** Render source blocks labeled by role, carrying labels and thin flags. */
function renderSourceBlocks(sm: SourceMaterial): string {
  return sm.blocks
    .map((b, i) => {
      const parts = [`role=${b.role}`];
      if (b.label) parts.push(`label=${JSON.stringify(b.label)}`);
      if (b.thin) parts.push("THIN=true (snippet only; full text unavailable)");
      return `=== SOURCE BLOCK ${i + 1} (${parts.join(", ")}) ===\n${b.content}`;
    })
    .join("\n\n");
}

export async function compile(sm: SourceMaterial): Promise<StageCallResult<Briefing>> {
  const prompt = `Compile the following source material into a research briefing. Remember: restructure only, verbatim figures with locations, extract (never invent) limitations, JSON only.

${renderSourceBlocks(sm)}`;

  return callStage({
    stage: "compile",
    tier: "small",
    system: COMPILE_SYSTEM,
    prompt,
    schema: briefingSchema,
    maxOutputTokens: 8192,
  });
}
