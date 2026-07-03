"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { JobRow } from "@/lib/explainer/types";
import { RotateCcwIcon } from "lucide-react";
import { JobStepper } from "./job-stepper";
import { LevelTabs } from "./level-tabs";
import { QaReport } from "./qa-report";
import { STATUS_BADGE_VARIANT, statusLabel } from "./recent-jobs";
import { RejectionReport } from "./rejection-report";
import { useExplainerJob } from "./use-explainer-job";

/**
 * The live job view: stepper + status badge always; then, by status, the
 * approved artifact (level tabs + QA report), a rejection report, or the
 * persisted error card. Transport failures of the advance loop get their own
 * retry row.
 */
export function JobView({
  jobId,
  initialJob,
}: {
  jobId: string;
  initialJob: JobRow;
}) {
  const { job, phase, error, retry } = useExplainerJob(jobId, initialJob);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <JobStepper status={job.status} errorWave={job.last_error?.wave} />
        <Badge variant={STATUS_BADGE_VARIANT[job.status]}>
          {statusLabel(job.status)}
        </Badge>
      </div>

      {phase === "advancing" && (
        <p className="text-sm text-muted-foreground">
          Working — each stage can take up to a minute. Keep this page open.
        </p>
      )}

      {job.status === "approved" && job.artifact && (
        <>
          <LevelTabs artifact={job.artifact} />
          <QaReport report={job.qa_report} />
        </>
      )}

      {(job.status === "rejected_input" || job.status === "rejected_qa") && (
        <RejectionReport report={job.qa_report} />
      )}

      {job.status === "error" && (
        <Card>
          <CardHeader>
            <CardTitle>Stage failed</CardTitle>
            <CardDescription>
              Wave {job.last_error?.wave ?? "?"}
              {job.last_error?.stage ? ` · ${job.last_error.stage}` : ""} —
              completed stages are kept; retry resumes from here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="break-words text-xs text-destructive">
              {job.last_error?.message ?? "Unknown error."}
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void retry()}
                disabled={phase === "advancing"}
              >
                <RotateCcwIcon className="size-3.5" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "failed" && job.status !== "error" && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-medium text-destructive">
            Could not advance the job
          </p>
          <p className="break-words text-muted-foreground">
            {error ?? "The request failed."} Check your connection and try
            again.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => void retry()}>
              <RotateCcwIcon className="size-3.5" />
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
