import type { JobRow, SourceMaterial } from "./types";

/**
 * FROZEN SIGNATURES (EXPLAINER-BUILD.md §10 Phase 0) — implementation owned by
 * Agent C (Phase 1). advance() is the SINGLE write-path for job state (§4).
 *
 * advance design (§4 wave map; each wave ends in ONE db.updateJobWave call):
 *   Wave = status === 'error' ? last_error.wave : WAVE_BY_STATUS[status]
 *   W1 (received):      compile → selfcheck. Fail → rejected_input + briefing +
 *                       qa_report{kind:'rejected_input'}. Pass → briefing_ready.
 *   W2 (briefing_ready): design → designed.
 *   W3 (designed):      Promise.all writers ×N → drafted + drafts.
 *   W4 (drafted):       Promise.all qaA ×N; drafts column OVERWRITTEN with
 *                       post-correction finals → qa_a_complete.
 *   W5 (qa_a_complete): Promise.all qaB ×N; pass computed in code
 *                       (stages/qaB.levelPasses); all pass → assemble (pure) →
 *                       approved + artifact + qa_report; any fail → rejected_qa.
 *   Terminal status → no-op, return the row unchanged (idempotent).
 *   Catch → status 'error', last_error {wave, stage?, message, at}; previously
 *   written columns untouched (completed waves never re-run or re-billed).
 *   Successful wave after a resume clears last_error (null). Usage is ALWAYS
 *   appended via usageAppend, including on failed waves that made LLM calls.
 */

export class JobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`explainer job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

export interface CreateExplainerJobInput {
  /** Caller-supplied idempotency key; generated when absent. */
  jobId?: string;
  threadId?: string;
  sourceMaterial: SourceMaterial;
  /** Parsed via explainerConfigSchema (defaults applied); invalid → throws. */
  config?: unknown;
}

export async function createExplainerJob(
  input: CreateExplainerJobInput,
): Promise<{ job: JobRow; created: boolean }> {
  void input;
  throw new Error("not implemented (Agent C)");
}

/** Runs EXACTLY ONE wave; returns the updated row. Terminal → no-op return. */
export async function advance(jobId: string): Promise<JobRow> {
  void jobId;
  throw new Error("not implemented (Agent C)");
}
