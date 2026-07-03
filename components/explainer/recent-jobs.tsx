import { relativeTime } from "@/components/chat/relative-time";
import { Badge } from "@/components/ui/badge";
import type { JobListItem, JobStatus } from "@/lib/explainer/types";
import Link from "next/link";

/**
 * Recent explainer jobs list (mirrors chat/thread-list.tsx). Server-rendered
 * on /explain; plain module so the variant map is also importable from the
 * client job view.
 */

export const STATUS_BADGE_VARIANT: Record<
  JobStatus,
  "default" | "secondary" | "destructive"
> = {
  received: "secondary",
  briefing_ready: "secondary",
  designed: "secondary",
  drafted: "secondary",
  qa_a_complete: "secondary",
  approved: "default",
  rejected_input: "destructive",
  rejected_qa: "destructive",
  error: "destructive",
};

export function statusLabel(status: JobStatus): string {
  return status.replace(/_/g, " ");
}

export function RecentJobs({ jobs }: { jobs: JobListItem[] }) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No jobs yet — paste material above and your explainers will show up
        here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link
            href={`/explain/${job.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
          >
            <span className="truncate text-sm">{job.title}</span>
            <Badge
              variant={STATUS_BADGE_VARIANT[job.status]}
              className="shrink-0"
            >
              {statusLabel(job.status)}
            </Badge>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {relativeTime(job.updated_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
