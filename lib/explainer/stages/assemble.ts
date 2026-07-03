import type {
  Artifact,
  Draft,
  ExplainerConfig,
  JobReport,
  JobRow,
  QaAResult,
  QaBVerdicts,
} from "../types";

/**
 * FROZEN SIGNATURE — implementation owned by Agent B (Phase 1).
 *
 * Assembly — PURE function, NO LLM call. Builds the approved-job artifact and
 * the qa_report (also used for rejected_qa: caller passes the same inputs and
 * uses only `report`).
 *
 * Rules (spec §5 / BUILD §3 output artifact):
 *  - combinedMarkdown = levels joined in cfg.audiences order, each preceded by
 *    `<!-- LEVEL:${audienceKey} -->` on its own line (level toggle contract).
 *  - Per-level markdown: title (h1), dek, body, "Key takeaways" list,
 *    "Limitations" list.
 *  - meta: citation (from the briefing via drafts' job), audiences used,
 *    createdAt (job.created_at) and completedAt (now, ISO).
 *  - report: kind 'qa' with per-level pass (computed via qaB.levelPasses),
 *    qaA verdict + changeLog, and the full qaB verdict table.
 */
export function assemble(
  drafts: Draft[],
  qaA: QaAResult[],
  qaB: QaBVerdicts[],
  cfg: ExplainerConfig,
  job: Pick<JobRow, "created_at" | "briefing">,
): { artifact: Artifact; report: JobReport } {
  void drafts;
  void qaA;
  void qaB;
  void cfg;
  void job;
  throw new Error("not implemented (Agent B)");
}
