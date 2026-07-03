import { Spinner } from "@/components/ui/spinner";
import type { JobStatus, Wave } from "@/lib/explainer/types";
import { cn } from "@/lib/utils";
import { CheckIcon, XIcon } from "lucide-react";

/**
 * Wave-progress stepper for an explainer job. Pure presentation: the five
 * pipeline waves mapped from the job status (plus the failing wave when the
 * status is 'error').
 */

const STEPS = ["Briefing", "Design", "Drafts", "QA-A", "QA-B"] as const;

const WAVE_INDEX: Record<Wave, number> = { W1: 0, W2: 1, W3: 2, W4: 3, W5: 4 };

const ACTIVE_INDEX: Partial<Record<JobStatus, number>> = {
  received: 0,
  briefing_ready: 1,
  designed: 2,
  drafted: 3,
  qa_a_complete: 4,
};

type StepState = "done" | "active" | "stopped" | "pending";

function stepStates(status: JobStatus, errorWave?: Wave): StepState[] {
  if (status === "approved" || status === "rejected_qa") {
    return STEPS.map(() => "done");
  }
  if (status === "rejected_input") {
    return STEPS.map((_, i) => (i === 0 ? "stopped" : "pending"));
  }
  if (status === "error") {
    const at = errorWave !== undefined ? WAVE_INDEX[errorWave] : 0;
    return STEPS.map((_, i) =>
      i < at ? "done" : i === at ? "stopped" : "pending",
    );
  }
  const active = ACTIVE_INDEX[status] ?? 0;
  return STEPS.map((_, i) =>
    i < active ? "done" : i === active ? "active" : "pending",
  );
}

function StepMarker({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return <CheckIcon aria-hidden className="size-3.5 text-primary" />;
    case "active":
      return <Spinner className="size-3.5" />;
    case "stopped":
      return <XIcon aria-hidden className="size-3.5 text-destructive" />;
    case "pending":
      return (
        <span
          aria-hidden
          className="mx-1 size-1.5 rounded-full bg-muted-foreground/40"
        />
      );
  }
}

export function JobStepper({
  status,
  errorWave,
}: {
  status: JobStatus;
  errorWave?: Wave;
}) {
  const states = stepStates(status, errorWave);
  return (
    <ol className="flex flex-wrap items-center gap-y-1 text-xs">
      {STEPS.map((label, i) => {
        const state = states[i];
        return (
          <li key={label} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className="mx-2 h-px w-4 border-t border-border"
              />
            )}
            <span
              className={cn(
                "flex items-center gap-1.5",
                state === "pending" && "text-muted-foreground",
                state === "stopped" && "text-destructive",
              )}
            >
              <StepMarker state={state} />
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
