import type {
  Artifact,
  Draft,
  ExplainerConfig,
  JobReport,
  JobRow,
  QaAResult,
  QaBVerdicts,
} from "../types";
import { levelPasses } from "./qaB";

/**
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

function levelMarkdown(d: Draft): string {
  const parts = [`# ${d.title}`];
  if (d.dek.trim()) parts.push(`*${d.dek.trim()}*`);
  parts.push(d.bodyMarkdown.trim());
  parts.push(`## Key takeaways\n\n${d.keyTakeaways.map((t) => `- ${t}`).join("\n")}`);
  parts.push(`## Limitations\n\n${d.limitations.map((l) => `- ${l}`).join("\n")}`);
  return parts.join("\n\n");
}

export function assemble(
  drafts: Draft[],
  qaA: QaAResult[],
  qaB: QaBVerdicts[],
  cfg: ExplainerConfig,
  job: Pick<JobRow, "created_at" | "briefing">,
): { artifact: Artifact; report: JobReport } {
  // Order levels by cfg.audiences order; drafts with unknown keys sort last.
  const order = new Map(cfg.audiences.map((a, i) => [a.key, i]));
  const levels = [...drafts].sort(
    (x, y) =>
      (order.get(x.audienceKey) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(y.audienceKey) ?? Number.MAX_SAFE_INTEGER),
  );

  const combinedMarkdown = levels
    .map((d) => `<!-- LEVEL:${d.audienceKey} -->\n${levelMarkdown(d)}`)
    .join("\n\n");

  const artifact: Artifact = {
    levels,
    combinedMarkdown,
    meta: {
      citation: job.briefing?.citation ?? "",
      audiences: cfg.audiences,
      createdAt: job.created_at,
      completedAt: new Date().toISOString(),
    },
  };

  const perLevel = levels.map((d) => {
    const a = qaA.find((r) => r.audienceKey === d.audienceKey);
    const b = qaB.find((r) => r.audienceKey === d.audienceKey);
    if (!a || !b) {
      throw new Error(`assemble: missing QA record for level "${d.audienceKey}"`);
    }
    return {
      audienceKey: d.audienceKey,
      pass: levelPasses(b, cfg.strictness),
      qaA: { verdict: a.verdict, changeLog: a.changeLog },
      qaB: b,
    };
  });

  const report: JobReport = {
    kind: "qa",
    approved: perLevel.every((l) => l.pass),
    perLevel,
  };

  return { artifact, report };
}
