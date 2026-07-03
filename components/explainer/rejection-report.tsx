"use client";

import type { JobReport } from "@/lib/explainer/types";
import { ClaimVerdictBadge } from "./qa-report";

/**
 * Legible rendering of the two rejection outcomes (fail-closed is a valid
 * output — the report tells the caller exactly what to fix):
 * - kind 'rejected_input': the self-check's missing-material list, with
 *   "what to add" emphasized.
 * - kind 'qa' (status rejected_qa): the failing levels' unsupported/distorted
 *   claims with evidence.
 */
export function RejectionReport({ report }: { report: JobReport | null }) {
  if (!report) return null;

  if (report.kind === "rejected_input") {
    const { missing, contradictions } = report.selfCheck;
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Input rejected</h2>
          <p className="text-sm text-muted-foreground">
            The material was not complete enough to explain safely. Add the
            items below and resubmit.
          </p>
        </div>

        {missing.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What to add
            </h3>
            <ul className="flex flex-col gap-4">
              {missing.map((item, i) => (
                <li key={i} className="flex flex-col gap-1.5 text-sm">
                  <p className="font-medium">{item.section}</p>
                  <p className="text-muted-foreground">{item.problem}</p>
                  <p className="border-l-2 border-primary pl-3">
                    {item.whatToAdd}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {contradictions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contradictions in the material
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
              {contradictions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // kind === 'qa' → status rejected_qa: show every failing claim per level.
  const failingLevels = report.perLevel.filter((level) => !level.pass);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Verification failed</h2>
        <p className="text-sm text-muted-foreground">
          One or more drafts contained claims that could not be verified
          against the source material, so nothing was delivered.
        </p>
      </div>

      {failingLevels.map((level) => {
        const failing = level.qaB.claims.filter(
          (c) => c.verdict !== "supported",
        );
        return (
          <div key={level.audienceKey} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium capitalize">
              {level.audienceKey}
            </h3>
            <ul className="flex flex-col gap-3">
              {failing.map((c, i) => (
                <li key={i} className="flex flex-col gap-1 text-sm">
                  <div className="flex items-start gap-2">
                    <ClaimVerdictBadge verdict={c.verdict} />
                    <p>{c.claim}</p>
                  </div>
                  <p className="pl-1 text-muted-foreground">{c.evidence}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <p className="text-sm text-muted-foreground">
        Resubmit with enriched source material that covers these claims — or
        remove them from scope — to get an approved explainer.
      </p>
    </div>
  );
}
