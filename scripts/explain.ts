/**
 * Explainer Engine CLI (EXPLAINER-BUILD.md §2 local orchestration).
 *
 * Usage (from the repo root):
 *   npx tsx --env-file=.env scripts/explain.ts --in <file> [--in <file> ...] --out <dir>
 *       [--job-id <id>] [--audiences key1,key2]
 *
 * First --in file becomes the primary source block; subsequent files are
 * supporting blocks; a metadata block is synthesized from the first
 * `# heading` line (or filename) of the first file. Loops advance() in-process
 * — the exact production wave code path — until a terminal status.
 *
 * Exit codes: 0 approved · 1 error (resumable via --job-id) · 2 rejected.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_AUDIENCES,
  WAVE_BY_STATUS,
  isTerminal,
  type JobRow,
  type SourceBlock,
  type StageUsage,
} from "../lib/explainer/types";
import { advance, createExplainerJob } from "../lib/explainer/orchestrate";

interface CliArgs {
  inFiles: string[];
  outDir: string;
  jobId?: string;
  audiences?: string[];
}

function usageAndExit(message?: string): never {
  if (message) console.error(`ERROR: ${message}\n`);
  console.error(
    "Usage: npx tsx --env-file=.env scripts/explain.ts --in <file> [--in <file> ...] --out <dir> [--job-id <id>] [--audiences key1,key2]",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const inFiles: string[] = [];
  let outDir: string | undefined;
  let jobId: string | undefined;
  let audiences: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) usageAndExit(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case "--in":
        inFiles.push(next());
        break;
      case "--out":
        outDir = next();
        break;
      case "--job-id":
        jobId = next();
        break;
      case "--audiences":
        audiences = next()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      default:
        usageAndExit(`unknown argument: ${arg}`);
    }
  }

  if (inFiles.length === 0) usageAndExit("at least one --in <file> is required");
  if (!outDir) usageAndExit("--out <dir> is required");
  return { inFiles, outDir, jobId, audiences };
}

function buildBlocks(inFiles: string[]): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  let title: string | undefined;

  inFiles.forEach((file, i) => {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) usageAndExit(`input file not found: ${resolved}`);
    const content = fs.readFileSync(resolved, "utf8");
    if (!content.trim()) usageAndExit(`input file is empty: ${resolved}`);
    const label = path.basename(resolved);
    blocks.push({ role: i === 0 ? "primary" : "supporting", label, content });
    if (i === 0) {
      const heading = content.match(/^#{1,6}\s+(.+)$/m);
      title = heading ? heading[1].trim() : label;
    }
  });

  blocks.push({ role: "metadata", label: "metadata", content: title ?? "Untitled job" });
  return blocks;
}

function summarizeUsage(usage: StageUsage[]): string {
  const lines = usage.map(
    (u) =>
      `  ${u.stage.padEnd(22)} ${u.model}  in=${u.inputTokens} out=${u.outputTokens}${u.retried ? " (retried)" : ""} ${u.ms}ms`,
  );
  const totalIn = usage.reduce((n, u) => n + u.inputTokens, 0);
  const totalOut = usage.reduce((n, u) => n + u.outputTokens, 0);
  lines.push(`  TOTAL: ${usage.length} calls, ${totalIn} input tokens, ${totalOut} output tokens`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const blocks = buildBlocks(args.inFiles);

  let config: { audiences: typeof DEFAULT_AUDIENCES } | undefined;
  if (args.audiences) {
    const selected = DEFAULT_AUDIENCES.filter((a) => args.audiences!.includes(a.key));
    if (selected.length === 0) {
      usageAndExit(
        `--audiences matched none of the default keys (${DEFAULT_AUDIENCES.map((a) => a.key).join(", ")})`,
      );
    }
    config = { audiences: selected };
  }

  const { job: createdJob, created } = await createExplainerJob({
    jobId: args.jobId,
    sourceMaterial: { blocks },
    config,
  });
  let job: JobRow = createdJob;
  console.log(
    created
      ? `Created job ${job.id} (status: ${job.status})`
      : `Resuming existing job ${job.id} (status: ${job.status})`,
  );

  while (!isTerminal(job.status)) {
    const wave = job.status === "error" ? job.last_error!.wave : WAVE_BY_STATUS[job.status]!;
    job = await advance(job.id);
    console.log(`${wave} → ${job.status}`);
    if (job.status === "error") {
      console.error("\nWave failed. last_error:");
      console.error(JSON.stringify(job.last_error, null, 2));
      console.error(
        `\nCompleted waves are checkpointed — re-run with --job-id ${job.id} to resume this wave.`,
      );
      process.exit(1);
    }
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  if (job.status === "approved") {
    const jsonPath = path.join(outDir, `${job.id}.json`);
    const mdPath = path.join(outDir, `${job.id}.md`);
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        { artifact: job.artifact, qa_report: job.qa_report, usage: job.usage },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(mdPath, job.artifact!.combinedMarkdown, "utf8");
    console.log(`\nApproved. Wrote:\n  ${jsonPath}\n  ${mdPath}`);
    console.log("\nUsage:");
    console.log(summarizeUsage(job.usage));
    process.exit(0);
  }

  // rejected_input | rejected_qa
  const rejectionPath = path.join(outDir, `${job.id}.rejection.json`);
  fs.writeFileSync(
    rejectionPath,
    JSON.stringify({ status: job.status, qa_report: job.qa_report, usage: job.usage }, null, 2),
    "utf8",
  );
  console.error(`\nJob ${job.status}. Report written to ${rejectionPath}\n`);

  const report = job.qa_report;
  if (report?.kind === "rejected_input") {
    console.error("Input rejected — what to add:");
    for (const m of report.selfCheck.missing) {
      console.error(`  - [${m.section}] ${m.problem}`);
      console.error(`      add: ${m.whatToAdd}`);
    }
    for (const c of report.selfCheck.contradictions) {
      console.error(`  - contradiction: ${c}`);
    }
  } else if (report?.kind === "qa") {
    console.error("QA rejected — per-level verdicts:");
    for (const level of report.perLevel) {
      console.error(`  ${level.audienceKey}: ${level.pass ? "pass" : "FAIL"}`);
      for (const claim of level.qaB.claims) {
        if (claim.verdict !== "supported") {
          console.error(`    [${claim.verdict}] ${claim.claim}`);
          console.error(`      evidence: ${claim.evidence}`);
        }
      }
    }
  }
  process.exit(2);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
