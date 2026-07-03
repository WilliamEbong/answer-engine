import { StageError } from "./run";
import {
  WAVE_BY_STATUS,
  explainerConfigSchema,
  isTerminal,
  sourceMaterialSchema,
  type Draft,
  type JobRow,
  type SourceMaterial,
  type StageUsage,
  type Wave,
} from "./types";
import { createJob, getJob, updateJobWave, type JobWavePatch } from "./db";
import { compile } from "./stages/compile";
import { selfcheck } from "./stages/selfcheck";
import { design } from "./stages/design";
import { write } from "./stages/write";
import { qaA } from "./stages/qaA";
import { qaB, levelPasses } from "./stages/qaB";
import { assemble } from "./stages/assemble";

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
  const config = explainerConfigSchema.parse(input.config ?? {});
  const sourceMaterial = sourceMaterialSchema.parse(input.sourceMaterial);
  const jobId = input.jobId ?? crypto.randomUUID();
  return createJob({
    id: jobId,
    threadId: input.threadId ?? null,
    config,
    sourceMaterial,
  });
}

/** Runs EXACTLY ONE wave; returns the updated row. Terminal → no-op return. */
export async function advance(jobId: string): Promise<JobRow> {
  const row = await getJob(jobId);
  if (!row) throw new JobNotFoundError(jobId);
  if (isTerminal(row.status)) return row;

  // The status we read is the optimistic-concurrency guard — including 'error'
  // when resuming (the resumed wave re-runs, completed waves never do).
  const currentStatus = row.status;
  const wave: Wave =
    currentStatus === "error"
      ? row.last_error!.wave
      : WAVE_BY_STATUS[currentStatus]!;

  const usageAppend: StageUsage[] = [];
  let patch: JobWavePatch;
  try {
    patch = await runWave(wave, row, usageAppend);
    if (currentStatus === "error") patch.last_error = null; // successful resume
  } catch (err) {
    patch = {
      status: "error",
      last_error: {
        wave,
        stage: err instanceof StageError ? err.stage : undefined,
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      },
    };
  }
  if (usageAppend.length > 0) patch.usageAppend = usageAppend;

  const updated = await updateJobWave(jobId, currentStatus, patch);
  if (updated) return updated;

  // A concurrent advance won the optimistic guard — return the fresh row.
  const fresh = await getJob(jobId);
  if (!fresh) throw new JobNotFoundError(jobId);
  return fresh;
}

/**
 * Runs one wave's stage calls and returns the checkpoint patch. Successful
 * stage usage is pushed onto `usageAppend` as it completes so partially
 * successful sequential waves still bill (usage from Promise.all rejections
 * is lost — acceptable per plan).
 */
async function runWave(
  wave: Wave,
  row: JobRow,
  usageAppend: StageUsage[],
): Promise<JobWavePatch> {
  const cfg = row.config;

  switch (wave) {
    case "W1": {
      const compiled = await compile(row.source_material);
      usageAppend.push(compiled.usage);
      const briefing = compiled.data;

      const checked = await selfcheck(briefing);
      usageAppend.push(checked.usage);

      if (checked.result.pass === false) {
        return {
          status: "rejected_input",
          briefing,
          qa_report: { kind: "rejected_input", selfCheck: checked.result },
        };
      }
      return { status: "briefing_ready", briefing };
    }

    case "W2": {
      const designed = await design(row.briefing!, cfg);
      usageAppend.push(designed.usage);
      return { status: "designed", design: designed.data };
    }

    case "W3": {
      const briefing = row.briefing!;
      const levels = row.design!.levels;
      const results = await Promise.all(
        cfg.audiences.map((a) => {
          const ld = levels.find((l) => l.audienceKey === a.key);
          if (!ld) {
            throw new StageError(
              `write:${a.key}`,
              `design has no level for audience "${a.key}"`,
            );
          }
          return write(briefing, ld, cfg);
        }),
      );
      for (const r of results) usageAppend.push(r.usage);
      return { status: "drafted", drafts: results.map((r) => r.data) };
    }

    case "W4": {
      const briefing = row.briefing!;
      const drafts = row.drafts!;
      const results = await Promise.all(drafts.map((d) => qaA(briefing, d, cfg)));
      for (const r of results) usageAppend.push(r.usage);
      const qa_a = results.map((r) => r.data);
      // Overwrite drafts with post-correction finals — W5 reads one canonical set.
      const finalDrafts: Draft[] = qa_a.map((r, i) =>
        r.verdict === "corrected" ? r.correctedDraft! : drafts[i],
      );
      return { status: "qa_a_complete", qa_a, drafts: finalDrafts };
    }

    case "W5": {
      const briefing = row.briefing!;
      const finalDrafts = row.drafts!;
      const results = await Promise.all(finalDrafts.map((d) => qaB(briefing, d, cfg)));
      for (const r of results) usageAppend.push(r.usage);
      const qa_b = results.map((r) => r.data);

      const allPass = qa_b.every((v) => levelPasses(v, cfg.strictness));
      // assemble is pure; it provides the qa_report for BOTH outcomes
      // (artifact discarded on rejection).
      const { artifact, report } = assemble(finalDrafts, row.qa_a!, qa_b, cfg, row);

      if (allPass) {
        return { status: "approved", qa_b, artifact, qa_report: report };
      }
      return { status: "rejected_qa", qa_b, qa_report: report };
    }
  }
}
