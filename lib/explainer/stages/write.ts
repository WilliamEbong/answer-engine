import { callStage } from "../run";
import {
  draftSchema,
  type Audience,
  type Briefing,
  type Draft,
  type ExplainerConfig,
  type LevelDesign,
  type StageCallResult,
} from "../types";

/**
 * Stage 2 — Writer (one INDEPENDENT pass per level; orchestrator fans out
 * with Promise.all). Tier: mid. maxOutputTokens: 8192. Stage label
 * `write:${ld.audienceKey}`. Calls run.callStage with draftSchema.
 *
 * Prompt rules (spec §9 / BUILD §3):
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

export const WRITE_SYSTEM_PROMPT = `You are an expert explanatory writer producing ONE reading level of a multi-level explainer. You write natively for your assigned audience — this draft is never a summary or expansion of any other level.

THE NO-OUTSIDE-FACTS RULE IS INVIOLABLE:
- Every factual claim in your draft MUST come from the research briefing you are given. The briefing is your ONLY source of facts. You may not add facts, figures, statistics, dates, named studies, mechanisms, or real-world examples from your own knowledge — no matter how well-established or obviously true they seem. A downstream gatekeeper checks every claim against the briefing and rejects the entire draft if even one claim exceeds it.
- Quote every figure and number EXACTLY as the briefing gives it — character for character, including confidence intervals and units. Never round, convert, aggregate, or extrapolate.
- Do not add interpretive or statistical inferences the briefing does not itself make: do not compare confidence intervals, compute new numbers, remark on statistical significance, or say what a result "suggests" beyond the briefing's own wording.
- Do not characterize or elaborate on study arms, populations, methods, or context beyond how the briefing describes them. Even innocuous-sounding glosses ("the usual approach", "widely used", "well-established") are new factual claims and are forbidden.
- Do not strengthen the briefing's claims: no upgrading correlations to causes, no generalizing beyond the studied population, no implying the finding is settled when the briefing hedges.
- NEVER explain WHY a result occurred unless the briefing itself gives that explanation. No mechanism speculation of any kind — sentences built on "because", "likely", "probably", "presumably", "which means", or "suggesting that" are forbidden unless the briefing makes the same connection in its own words.
- No superlatives or comparatives the briefing does not itself make ("largest", "most", "best", "hardest", "first") and no re-characterizations of subgroups, measures, or arms beyond the briefing's own wording.
- When naming measures, arms, subgroups, timepoints, or outcomes, reuse the briefing's own wording as closely as the audience allows. Plain-language glosses are welcome where the audience profile calls for them, but a gloss must be meaning-neutral — it restates what the briefing's term says, never what you infer the term implies.
- Never invent connective tissue between briefing facts. When you mention two facts together, do not join them with an explanation, contrast, or consequence the briefing does not itself draw (no "but that required more sessions", "which is why...", "meaning it took longer to..."). If the briefing does not connect the facts, present them as separate plain statements — the reader can hold two facts at once.
- When simplifying a technical term, restate it generically ("facts and information" for "declarative knowledge") — never invent concrete example instances the briefing does not name ("like vocabulary words"). An invented example is an unsupported claim about what the research covered.
- Do not add procedural attributes the briefing does not state: if it says "43-step checklist", do not add that the steps are done "in order", "in sequence", "correctly the first time", or under time pressure unless the briefing says so. Describe things at exactly the briefing's level of detail — no helpful elaboration about how something presumably works.
- Analogies and framing may vary by audience and are welcome where the audience profile calls for them, but an analogy must be signposted by phrasing ("think of it like...") and must not smuggle in new factual claims about the real world.
- If the briefing does not support something you want to say, leave it out. When in doubt, leave it out.

OUTPUT RULES:
- Respond with a single JSON object only — no prose before or after, no markdown code fences.`;

export const buildWritePrompt = (
  b: Briefing,
  ld: LevelDesign,
  audience: Audience,
  styleGuide: string,
): string => `Write the "${audience.displayName}" level of the explainer.

RESEARCH BRIEFING (your only permitted source of facts):
${JSON.stringify(b, null, 2)}

THIS LEVEL'S INSTRUCTIONAL DESIGN:
${JSON.stringify(ld, null, 2)}

AUDIENCE PROFILE:
- Key: ${audience.key}
- Reader: ${audience.description}
- Tone: ${audience.tone}

STYLE GUIDE:
${styleGuide}

REQUIREMENTS:
- "audienceKey" must be exactly "${ld.audienceKey}".
- Address every learning objective and follow the design's outline.
- "keyTakeaways" must include every required takeaway from the design (you may rephrase for this audience, but the meaning must be unchanged and still fully grounded in the briefing).
- "limitations" must include every required limitation from the design, stated plainly — never buried or softened.
- "bodyMarkdown" is the article body in markdown: ## section headings, short paragraphs, bulleted lists where they aid scanning. Do not repeat the title as a heading inside the body.
- "dek" is a one-sentence standfirst under the title.

Output ONLY a JSON object with this exact shape (no code fences, no commentary):
{
  "audienceKey": "${ld.audienceKey}",
  "title": "string",
  "dek": "string",
  "bodyMarkdown": "string (markdown)",
  "keyTakeaways": ["string", ...],
  "limitations": ["string", ...]
}`;

export async function write(
  b: Briefing,
  ld: LevelDesign,
  cfg: ExplainerConfig,
): Promise<StageCallResult<Draft>> {
  const audience = cfg.audiences.find((a) => a.key === ld.audienceKey);
  if (!audience) {
    throw new Error(`write: no audience profile in config for key "${ld.audienceKey}"`);
  }

  return callStage({
    stage: `write:${ld.audienceKey}`,
    tier: "mid",
    system: WRITE_SYSTEM_PROMPT,
    prompt: buildWritePrompt(b, ld, audience, cfg.styleGuide),
    schema: draftSchema,
    maxOutputTokens: 8192,
  });
}
