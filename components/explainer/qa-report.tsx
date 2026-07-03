"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { JobReport, ClaimVerdict } from "@/lib/explainer/types";

/**
 * Collapsible QA report for an approved job: per level, the QA-A editorial
 * verdict (+ change log) and the QA-B claim-by-claim verdict table.
 */
export function QaReport({ report }: { report: JobReport | null }) {
  if (!report || report.kind !== "qa") return null;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="qa-report">
        <AccordionTrigger className="text-sm">QA report</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-6">
          {report.perLevel.map((level) => (
            <section key={level.audienceKey} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium capitalize">
                  {level.audienceKey}
                </h3>
                <Badge variant={level.pass ? "default" : "destructive"}>
                  {level.pass ? "pass" : "fail"}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground">
                Editorial pass (QA-A): {level.qaA.verdict}
              </p>
              {level.qaA.changeLog.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium">Corrections applied</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
                    {level.qaA.changeLog.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Claim</th>
                      <th className="px-3 py-2 font-medium">Verdict</th>
                      <th className="px-3 py-2 font-medium">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {level.qaB.claims.map((c, i) => (
                      <tr
                        key={i}
                        className="border-b border-border align-top last:border-b-0"
                      >
                        <td className="px-3 py-2">{c.claim}</td>
                        <td className="px-3 py-2">
                          <ClaimVerdictBadge verdict={c.verdict} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {c.evidence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {level.qaB.capped && (
                <p className="text-xs text-muted-foreground">
                  Claim list truncated at 40 most substantive claims.
                </p>
              )}
            </section>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function ClaimVerdictBadge({
  verdict,
}: {
  verdict: ClaimVerdict["verdict"];
}) {
  return (
    <Badge variant={verdict === "supported" ? "secondary" : "destructive"}>
      {verdict}
    </Badge>
  );
}
