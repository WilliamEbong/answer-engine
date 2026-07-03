/**
 * Explainer Engine gate tests (EXPLAINER-BUILD.md §11).
 *
 * Usage: npx tsx --env-file=.env scripts/explainer-gates.ts [--keep]
 *
 * Runs G1 → G2 → G4 → G3 → G5 (G3 reuses G4's approved output; §11 gate
 * numbering is kept in all labels). All jobs run in-process through the
 * production code path (createExplainerJob/advance). Real LLM calls.
 * Cleans up its `gate%` rows at the end unless --keep is passed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_AUDIENCES,
  artifactSchema,
  isTerminal,
  type Draft,
  type JobRow,
  type SourceMaterial,
  type StageUsage,
} from "../lib/explainer/types";
import { advance, createExplainerJob } from "../lib/explainer/orchestrate";
import { qaB, levelPasses } from "../lib/explainer/stages/qaB";
import { getPool } from "../lib/explainer/db";

// ---------------------------------------------------------------------------
// Check collector & usage tracking
// ---------------------------------------------------------------------------

let totalChecks = 0;
let failedChecks = 0;
const gateSummaries: Array<{ gate: string; pass: boolean }> = [];

function check(label: string, cond: boolean): boolean {
  totalChecks++;
  if (!cond) failedChecks++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}`);
  return cond;
}

/** Final usage per job (last row seen wins — usage only ever appends). */
const jobUsage = new Map<string, StageUsage[]>();
/** Usage from direct qaB dry-runs (G2, G3) — never persisted, counted here. */
const dryRunUsage: StageUsage[] = [];

function track(row: JobRow): JobRow {
  jobUsage.set(row.id, row.usage);
  return row;
}

async function runGate(gate: string, title: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n== ${gate} — ${title} ==`);
  const before = failedChecks;
  try {
    await fn();
  } catch (err) {
    check(`${gate} completed without throwing (threw: ${err instanceof Error ? err.message : String(err)})`, false);
  }
  const pass = failedChecks === before;
  gateSummaries.push({ gate, pass });
  console.log(`${gate}: ${pass ? "PASS" : "FAIL"}`);
}

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

function readFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "fixtures", "explainer", name), "utf8");
}

function sourceMaterialFromFixture(text: string): SourceMaterial {
  return { blocks: [{ role: "primary", content: text }] };
}

/** Collapse all whitespace runs to single spaces (G1 verbatim-figure check). */
function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const keep = process.argv.includes("--keep");
  const richText = readFixture("rich-input.md");
  const thinText = readFixture("thin-input.md");
  const richSm = sourceMaterialFromFixture(richText);
  const thinSm = sourceMaterialFromFixture(thinText);
  const richNorm = normWs(richText);

  // Shared across gates (execution order G1 → G2 → G4 → G3 → G5).
  let g4Job: JobRow | null = null;

  // ------------------------------------------------------------------- G1
  await runGate("G1", "input gate (thin rejected / rich briefing)", async () => {
    // Thin fixture → rejected_input with actionable missing-items list.
    const thinId = `gate1-thin-${Date.now()}`;
    track((await createExplainerJob({ jobId: thinId, sourceMaterial: thinSm })).job);
    const thinJob = track(await advance(thinId));
    check("G1 thin: one advance → status 'rejected_input'", thinJob.status === "rejected_input");
    const report = thinJob.qa_report;
    check("G1 thin: qa_report.kind === 'rejected_input'", report?.kind === "rejected_input");
    const missing = report?.kind === "rejected_input" ? report.selfCheck.missing : [];
    check("G1 thin: selfCheck.missing.length > 0", missing.length > 0);
    check(
      "G1 thin: every missing item has non-empty whatToAdd",
      missing.length > 0 && missing.every((m) => m.whatToAdd.trim().length > 0),
    );

    // Rich fixture → briefing_ready with a complete, verbatim-grounded briefing.
    const richId = `gate1-rich-${Date.now()}`;
    track((await createExplainerJob({ jobId: richId, sourceMaterial: richSm })).job);
    const richJob = track(await advance(richId));
    check("G1 rich: one advance → status 'briefing_ready'", richJob.status === "briefing_ready");
    const b = richJob.briefing;
    check("G1 rich: briefing non-null", b !== null);
    check("G1 rich: coreFinding non-empty", (b?.coreFinding ?? "").trim().length > 0);
    check("G1 rich: context non-empty", (b?.context ?? "").trim().length > 0);
    check("G1 rich: methods non-empty", (b?.methods ?? "").trim().length > 0);
    const figured = (b?.keyResults ?? []).filter((k) => k.figure.trim().length > 0);
    check(`G1 rich: keyResults with non-empty figure >= 3 (got ${figured.length})`, figured.length >= 3);
    // §11 G1 requires ≥3 VERBATIM figures — not that every figure be verbatim
    // (compilers may attach units, e.g. "14.2 minutes" for "median 14.2 vs
    // 14.9 minutes"; Stage 0.5's code floor uses the same ≥3 bar). Figures
    // that are not literal substrings are logged for visibility only.
    const verbatim = figured.filter((k) => richNorm.includes(normWs(k.figure)));
    for (const k of figured) {
      if (!richNorm.includes(normWs(k.figure))) {
        console.log(`  ...  non-verbatim figure (informational): "${normWs(k.figure).slice(0, 60)}"`);
      }
    }
    check(
      `G1 rich: verbatim-grounded figures >= 3 (got ${verbatim.length}/${figured.length})`,
      verbatim.length >= 3,
    );
  });

  // ------------------------------------------------------------------- G2
  await runGate("G2", "single level end-to-end, qaB dry-run clean", async () => {
    const id = `gate2-single-${Date.now()}`;
    const intermediate = DEFAULT_AUDIENCES.find((a) => a.key === "intermediate")!;
    track(
      (
        await createExplainerJob({
          jobId: id,
          sourceMaterial: richSm,
          config: { audiences: [intermediate] },
        })
      ).job,
    );

    let job = track(await advance(id)); // W1
    check("G2: advance 1 → 'briefing_ready'", job.status === "briefing_ready");
    job = track(await advance(id)); // W2
    check("G2: advance 2 → 'designed'", job.status === "designed");
    job = track(await advance(id)); // W3
    check("G2: advance 3 → 'drafted'", job.status === "drafted");

    const draft = job.drafts?.[0];
    check("G2: drafts[0] present", draft !== undefined);
    if (!draft || !job.briefing) return;

    // qaB dry-run — NOT persisted; usage counted in the total.
    const { data: verdicts, usage } = await qaB(job.briefing, draft, job.config);
    dryRunUsage.push(usage);
    const bad = verdicts.claims.filter((c) => c.verdict !== "supported");
    check(
      `G2: qaB dry-run — levelPasses(strict) (claims: ${verdicts.claims.length})`,
      levelPasses(verdicts, "strict"),
    );
    check(
      `G2: zero unsupported/distorted claims (got ${bad.length}${bad.length > 0 ? `: ${bad.map((c) => `[${c.verdict}] ${c.claim}`).join(" | ").slice(0, 300)}` : ""})`,
      bad.length === 0,
    );
  });

  // ------------------------------------------------------------------- G4
  await runGate("G4", "full N=3 job → approved artifact", async () => {
    const id = `gate4-full-${Date.now()}`;
    let job = track((await createExplainerJob({ jobId: id, sourceMaterial: richSm })).job);
    let iterations = 0;
    while (!isTerminal(job.status) && iterations < 8) {
      job = track(await advance(id));
      iterations++;
      console.log(`  ... advance ${iterations} → ${job.status}`);
      if (job.status === "error") {
        console.log(`  ... last_error: ${JSON.stringify(job.last_error)}`);
      }
    }
    g4Job = job;

    check(`G4: terminal within 8 advances (took ${iterations})`, isTerminal(job.status));
    check(`G4: status 'approved' (got '${job.status}')`, job.status === "approved");
    if (job.status !== "approved" && job.qa_report?.kind === "qa") {
      for (const level of job.qa_report.perLevel) {
        for (const c of level.qaB.claims) {
          if (c.verdict !== "supported") {
            console.log(`  ... ${level.audienceKey} [${c.verdict}] ${c.claim}`);
          }
        }
      }
    }
    const parsed = artifactSchema.safeParse(job.artifact);
    check("G4: artifactSchema.safeParse(artifact).success", parsed.success);
    const md = job.artifact?.combinedMarkdown ?? "";
    for (const key of ["beginner", "intermediate", "advanced"]) {
      check(`G4: combinedMarkdown contains <!-- LEVEL:${key} -->`, md.includes(`<!-- LEVEL:${key} -->`));
    }
    check(`G4: usage.length >= 11 (got ${job.usage.length})`, job.usage.length >= 11);
    const stages = new Set(job.usage.map((u) => u.stage));
    for (const s of ["compile", "selfcheck", "design"]) {
      check(`G4: usage includes stage '${s}'`, stages.has(s));
    }
    for (const key of ["beginner", "intermediate", "advanced"]) {
      for (const prefix of ["write", "qaA", "qaB"]) {
        check(`G4: usage includes stage '${prefix}:${key}'`, stages.has(`${prefix}:${key}`));
      }
    }
  });

  // ------------------------------------------------------------------- G3
  await runGate("G3", "injected false claim → qaB names it", async () => {
    if (!g4Job || g4Job.status !== "approved" || !g4Job.drafts?.length || !g4Job.briefing) {
      check("G3: G4 produced an approved job with drafts (prerequisite)", false);
      return;
    }
    const corrupted: Draft = structuredClone(g4Job.drafts[0]);
    corrupted.bodyMarkdown +=
      "\n\nThe trial also demonstrated an 850% improvement in long-term staff retention.";

    const { data: verdicts, usage } = await qaB(g4Job.briefing, corrupted, g4Job.config);
    dryRunUsage.push(usage);
    const flagged = verdicts.claims.filter(
      (c) => (c.verdict === "unsupported" || c.verdict === "distorted") && c.claim.includes("850%"),
    );
    check(
      `G3: qaB flags the injected 850% claim as unsupported/distorted (claims: ${verdicts.claims.length}, flagged: ${flagged.length})`,
      flagged.length >= 1,
    );
    if (flagged.length >= 1) {
      console.log(`  ... named claim: [${flagged[0].verdict}] ${flagged[0].claim}`);
    }
  });

  // ------------------------------------------------------------------- G5
  await runGate("G5", "idempotency + error/resume", async () => {
    // -- G5a: idempotent resubmission of the G4 job id.
    if (!g4Job || g4Job.status !== "approved") {
      check("G5a: G4 produced an approved job (prerequisite)", false);
    } else {
      const g4Id = g4Job.id;
      const g4UsageLen = g4Job.usage.length;
      const resubmit = await createExplainerJob({ jobId: g4Id, sourceMaterial: richSm });
      track(resubmit.job);
      check("G5a: resubmission → created === false", resubmit.created === false);
      check("G5a: status still 'approved'", resubmit.job.status === "approved");
      check(
        `G5a: usage.length unchanged (${resubmit.job.usage.length} === ${g4UsageLen})`,
        resubmit.job.usage.length === g4UsageLen,
      );
      const noop = track(await advance(g4Id));
      check("G5a: extra advance on terminal job → still 'approved'", noop.status === "approved");
      check(
        `G5a: terminal advance is a no-op — usage.length unchanged (${noop.usage.length} === ${g4UsageLen})`,
        noop.usage.length === g4UsageLen,
      );
    }

    // -- G5b: forced wave error, then resume without re-running W1.
    const id = `gate5-resume-${Date.now()}`;
    track((await createExplainerJob({ jobId: id, sourceMaterial: richSm })).job);
    let job = track(await advance(id)); // W1, real calls
    check("G5b: advance 1 → 'briefing_ready'", job.status === "briefing_ready");

    process.env.EXPLAINER_FAIL_STAGE = "design";
    try {
      job = track(await advance(id)); // W2 forced failure
    } finally {
      delete process.env.EXPLAINER_FAIL_STAGE;
    }
    check("G5b: forced-failure advance → status 'error'", job.status === "error");
    check(`G5b: last_error.wave === 'W2' (got '${job.last_error?.wave}')`, job.last_error?.wave === "W2");
    check(
      `G5b: last_error.stage === 'design' (got '${job.last_error?.stage}')`,
      job.last_error?.stage === "design",
    );
    check("G5b: briefing still non-null after failure", job.briefing !== null);

    job = track(await advance(id)); // W2 resume
    check("G5b: resume advance → 'designed'", job.status === "designed");
    check("G5b: last_error cleared (null)", job.last_error === null);
    const compileEntries = job.usage.filter((u) => u.stage === "compile");
    check(
      `G5b: exactly ONE 'compile' usage entry — W1 never re-billed (got ${compileEntries.length})`,
      compileEntries.length === 1,
    );
    // STOP — do not finish this job (saves cost).
  });

  // ------------------------------------------------------------- summary
  console.log("\n== SUMMARY ==");
  for (const g of gateSummaries) console.log(`${g.gate}: ${g.pass ? "PASS" : "FAIL"}`);
  const gatesPassed = gateSummaries.filter((g) => g.pass).length;
  console.log(
    `${gatesPassed}/${gateSummaries.length} gates passed · ${totalChecks - failedChecks}/${totalChecks} checks ok`,
  );

  const allUsage: StageUsage[] = [...dryRunUsage];
  for (const usage of jobUsage.values()) allUsage.push(...usage);
  const totalIn = allUsage.reduce((n, u) => n + u.inputTokens, 0);
  const totalOut = allUsage.reduce((n, u) => n + u.outputTokens, 0);
  console.log(
    `Total token usage: ${allUsage.length} LLM calls (${dryRunUsage.length} qaB dry-runs) · input=${totalIn} · output=${totalOut}`,
  );
  const byModel = new Map<string, { calls: number; input: number; output: number }>();
  for (const u of allUsage) {
    const m = byModel.get(u.model) ?? { calls: 0, input: 0, output: 0 };
    m.calls++;
    m.input += u.inputTokens;
    m.output += u.outputTokens;
    byModel.set(u.model, m);
  }
  for (const [model, m] of byModel) {
    console.log(`  ${model}: ${m.calls} calls · input=${m.input} · output=${m.output}`);
  }

  // ------------------------------------------------------------- cleanup
  if (keep) {
    console.log("\n--keep passed: leaving gate% rows in explainer_jobs.");
  } else {
    const res = await getPool().query("delete from explainer_jobs where id like 'gate%'");
    console.log(`\nCleaned up ${res.rowCount} gate% test row(s).`);
  }

  process.exit(failedChecks > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
