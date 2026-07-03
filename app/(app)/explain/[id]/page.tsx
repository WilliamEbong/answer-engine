import { JobView } from "@/components/explainer/job-view";
import { getJob } from "@/lib/explainer/db";
import type { JobRow } from "@/lib/explainer/types";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExplainJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let job: JobRow | null = null;
  try {
    job = await getJob(id);
  } catch {
    // DB layer not ready / unreachable — degrade to a not-found state.
  }
  if (!job) notFound();

  // JobRow is plain JSON (ISO timestamp strings) — safe to hand to the client.
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <JobView jobId={id} initialJob={job} />
      </div>
    </div>
  );
}
