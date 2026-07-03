import { z } from "zod";

/**
 * FROZEN CONTRACT (EXPLAINER-BUILD.md §10 Phase 0) — only the main agent may
 * amend this file. Every schema, the status enum, and the wave map for the
 * Explainer Engine live here. Subagents A–D compile against these types.
 */

// ---------------------------------------------------------------------------
// Status & waves
// ---------------------------------------------------------------------------

export const JOB_STATUSES = [
  "received",
  "briefing_ready",
  "rejected_input",
  "designed",
  "drafted",
  "qa_a_complete",
  "approved",
  "rejected_qa",
  "error",
] as const;

export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const TERMINAL_STATUSES = ["rejected_input", "approved", "rejected_qa"] as const;

export function isTerminal(status: JobStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export type Wave = "W1" | "W2" | "W3" | "W4" | "W5";

/**
 * Which wave `advance` runs next for a given status. Terminal statuses and
 * `error` are absent — `error` resumes via `last_error.wave`.
 */
export const WAVE_BY_STATUS: Partial<Record<JobStatus, Wave>> = {
  received: "W1",
  briefing_ready: "W2",
  designed: "W3",
  drafted: "W4",
  qa_a_complete: "W5",
};

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export const sourceBlockSchema = z.object({
  role: z.enum(["primary", "supporting", "metadata"]),
  /** Human label, e.g. source title or URL. */
  label: z.string().optional(),
  content: z.string().min(1),
  /** Set by enrich() fallback when full text was unavailable — Stage 0.5 arbitrates. */
  thin: z.boolean().optional(),
});
export type SourceBlock = z.infer<typeof sourceBlockSchema>;

export const sourceMaterialSchema = z
  .object({ blocks: z.array(sourceBlockSchema).min(1) })
  .refine(
    (sm) => sm.blocks.some((b) => b.role === "primary"),
    "source_material must include at least one primary block",
  );
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const audienceSchema = z.object({
  /** Stable key used in level markers, tabs, and per-level records ("beginner"). */
  key: z.string().min(1),
  displayName: z.string().min(1),
  /** Assumed knowledge of the reader. */
  description: z.string().min(1),
  /** Tone guidance for the writer. */
  tone: z.string().min(1),
});
export type Audience = z.infer<typeof audienceSchema>;

export const DEFAULT_AUDIENCES: Audience[] = [
  {
    key: "beginner",
    displayName: "Beginner",
    description:
      "A curious general reader with no background in the field. Knows everyday concepts only; jargon must be introduced with plain-language definitions or avoided.",
    tone: "Warm, concrete, patient. Use everyday analogies. Short sentences. Never condescending.",
  },
  {
    key: "intermediate",
    displayName: "Intermediate",
    description:
      "A reader with general science/tech literacy — comfortable with percentages, study design basics, and common technical terms, but not a specialist in this field.",
    tone: "Clear and direct. Standard technical terms allowed with brief glosses. Focus on how and why, not just what.",
  },
  {
    key: "advanced",
    displayName: "Advanced",
    description:
      "A practitioner or researcher adjacent to the field. Expects precise terminology, methodological detail, effect sizes, and honest treatment of limitations.",
    tone: "Dense, precise, neutral. No hand-holding. Quantify wherever the briefing quantifies.",
  },
];

export const DEFAULT_STYLE_GUIDE = `Write in clear, active prose. Lead with the finding, not the setup.
Every factual claim must come from the briefing — never add outside knowledge as fact.
Quote figures exactly as the briefing gives them; do not round or extrapolate.
State limitations plainly; never bury or soften them.
No hype: avoid "breakthrough", "revolutionary", "game-changing" and similar framing.
Use markdown: ## section headings, short paragraphs, bulleted lists where they aid scanning.
Analogies are welcome where the audience profile calls for them, but must be flagged by phrasing ("think of it like...") and must not smuggle in new factual claims.`;

export const explainerConfigSchema = z.object({
  audiences: z.array(audienceSchema).min(1).default(DEFAULT_AUDIENCES),
  styleGuide: z.string().min(1).default(DEFAULT_STYLE_GUIDE),
  /** strict = any unsupported/distorted claim fails; lenient allows clearly-flagged context statements. */
  strictness: z.enum(["strict", "lenient"]).default("strict"),
  /** Spec hard-caps correction cycles at one. */
  maxCorrectionCycles: z.number().int().min(0).max(1).default(1),
});
/** Persist the parsed (z.output) form so defaults are materialized in the DB. */
export type ExplainerConfig = z.output<typeof explainerConfigSchema>;

// ---------------------------------------------------------------------------
// Stage 0 — Research Briefing
// ---------------------------------------------------------------------------

export const keyResultSchema = z.object({
  claim: z.string().min(1),
  /** VERBATIM quote of the figure/number from the source material. */
  figure: z.string(),
  /** Where in the source it appears (section/paragraph description). */
  location: z.string(),
});
export type KeyResult = z.infer<typeof keyResultSchema>;

export const briefingSchema = z.object({
  coreFinding: z.string().min(1),
  context: z.string().min(1),
  methods: z.string().min(1),
  keyResults: z.array(keyResultSchema),
  limitations: z.array(z.string()),
  openQuestions: z.array(z.string()),
  terminology: z.array(z.object({ term: z.string(), definition: z.string() })),
  citation: z.string(),
});
export type Briefing = z.infer<typeof briefingSchema>;

// ---------------------------------------------------------------------------
// Stage 0.5 — Self-check (input gate)
// ---------------------------------------------------------------------------

export const selfCheckSchema = z.object({
  pass: z.boolean(),
  /** Actionable, per-item report — tells the caller exactly what material to add (G1). */
  missing: z.array(
    z.object({
      section: z.string(),
      problem: z.string(),
      whatToAdd: z.string(),
    }),
  ),
  contradictions: z.array(z.string()),
});
export type SelfCheckResult = z.infer<typeof selfCheckSchema>;

/** Minimum verbatim-grounded figures/claims a briefing must carry (spec §3 / Stage 0.5). */
export const MIN_VERBATIM_FIGURES = 3;

// ---------------------------------------------------------------------------
// Stage 1 — Instructional design
// ---------------------------------------------------------------------------

export const levelDesignSchema = z.object({
  audienceKey: z.string().min(1),
  learningObjectives: z.array(z.string()).min(1),
  outline: z.array(z.string()).min(1),
  requiredTakeaways: z.array(z.string()).min(1),
  requiredLimitations: z.array(z.string()),
});
export type LevelDesign = z.infer<typeof levelDesignSchema>;

export const designSchema = z.object({ levels: z.array(levelDesignSchema).min(1) });
export type Design = z.infer<typeof designSchema>;

// ---------------------------------------------------------------------------
// Stage 2 — Drafts
// ---------------------------------------------------------------------------

export const draftSchema = z.object({
  audienceKey: z.string().min(1),
  title: z.string().min(1),
  dek: z.string(),
  bodyMarkdown: z.string().min(1),
  keyTakeaways: z.array(z.string()).min(1),
  limitations: z.array(z.string()).min(1),
});
export type Draft = z.infer<typeof draftSchema>;

// ---------------------------------------------------------------------------
// Stage 3 — QA-A (combined editorial pass)
// ---------------------------------------------------------------------------

export const qaAResultSchema = z
  .object({
    audienceKey: z.string().min(1),
    verdict: z.enum(["pass", "corrected"]),
    scores: z.object({
      fidelity: z.number().min(0).max(10),
      editorial: z.number().min(0).max(10),
      consistency: z.number().min(0).max(10),
      hype: z.number().min(0).max(10),
    }),
    correctedDraft: draftSchema.optional(),
    changeLog: z.array(z.string()).default([]),
  })
  .refine(
    (r) => r.verdict !== "corrected" || r.correctedDraft !== undefined,
    "verdict 'corrected' requires correctedDraft",
  );
export type QaAResult = z.infer<typeof qaAResultSchema>;

// ---------------------------------------------------------------------------
// Stage 4 — QA-B source-comparison gatekeeper
// ---------------------------------------------------------------------------

/** §9.4: cap claim extraction at the 40 most substantive claims. */
export const MAX_QA_B_CLAIMS = 40;

export const claimVerdictSchema = z.object({
  claim: z.string().min(1),
  verdict: z.enum(["supported", "unsupported", "distorted"]),
  /** Briefing evidence for supported claims; explanation of the failure otherwise. */
  evidence: z.string(),
  /** lenient mode only: true when the claim is clearly flagged as context, not finding. */
  flaggedContext: z.boolean().optional(),
});
export type ClaimVerdict = z.infer<typeof claimVerdictSchema>;

export const qaBVerdictsSchema = z.object({
  audienceKey: z.string().min(1),
  claims: z.array(claimVerdictSchema).max(MAX_QA_B_CLAIMS),
  /** true when the 40-claim cap truncated extraction — noted in qa_report (§9.4). */
  capped: z.boolean().default(false),
});
export type QaBVerdicts = z.infer<typeof qaBVerdictsSchema>;

// ---------------------------------------------------------------------------
// Artifact & reports
// ---------------------------------------------------------------------------

export const artifactSchema = z.object({
  levels: z.array(draftSchema),
  /** All levels joined, each preceded by `<!-- LEVEL:key -->`. */
  combinedMarkdown: z.string().min(1),
  meta: z.object({
    citation: z.string(),
    audiences: z.array(audienceSchema),
    createdAt: z.string(),
    completedAt: z.string(),
  }),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const jobReportSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rejected_input"),
    selfCheck: selfCheckSchema,
  }),
  z.object({
    kind: z.literal("qa"),
    approved: z.boolean(),
    perLevel: z.array(
      z.object({
        audienceKey: z.string(),
        pass: z.boolean(),
        qaA: z.object({
          verdict: z.enum(["pass", "corrected"]),
          changeLog: z.array(z.string()),
        }),
        qaB: qaBVerdictsSchema,
      }),
    ),
  }),
]);
export type JobReport = z.infer<typeof jobReportSchema>;

// ---------------------------------------------------------------------------
// Usage & errors
// ---------------------------------------------------------------------------

export interface StageUsage {
  /** e.g. "compile" | "selfcheck" | "design" | "write:beginner" | "qaA:advanced" | "qaB:intermediate" */
  stage: string;
  /** Resolved model id (tier env or LLM_MODEL). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** true if the one schema-error retry ran. */
  retried: boolean;
  ms: number;
}

export interface JobError {
  wave: Wave;
  stage?: string;
  message: string;
  /** ISO timestamp. */
  at: string;
}

// ---------------------------------------------------------------------------
// Job rows (mirror migrations/002_explainer.sql)
// ---------------------------------------------------------------------------

export interface JobRow {
  id: string;
  thread_id: string | null;
  config: ExplainerConfig;
  source_material: SourceMaterial;
  status: JobStatus;
  briefing: Briefing | null;
  design: Design | null;
  /** W4 overwrites with post-correction drafts — W5 reads one canonical set. */
  drafts: Draft[] | null;
  qa_a: QaAResult[] | null;
  qa_b: QaBVerdicts[] | null;
  artifact: Artifact | null;
  qa_report: JobReport | null;
  usage: StageUsage[];
  last_error: JobError | null;
  created_at: string;
  updated_at: string;
}

export interface JobListItem {
  id: string;
  thread_id: string | null;
  status: JobStatus;
  /** Derived from the metadata block (truncated); fallback "Untitled job". */
  title: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Stage call plumbing (implemented in run.ts; typed here for stage signatures)
// ---------------------------------------------------------------------------

export interface StageCallResult<T> {
  data: T;
  usage: StageUsage;
}
