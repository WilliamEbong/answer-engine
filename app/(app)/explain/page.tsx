import { ExplainForm } from "@/components/explainer/explain-form";
import { RecentJobs } from "@/components/explainer/recent-jobs";
import { listJobs } from "@/lib/explainer/db";

// Job list must always be fresh (and lib/explainer/db needs runtime env).
export const dynamic = "force-dynamic";

export default async function ExplainPage() {
  // DB layer not ready / unreachable — degrade to an empty list.
  const jobs = await listJobs().catch(() => []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pb-16 pt-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Explainer</h1>
          <p className="text-sm text-muted-foreground">
            Paste source material and get it explained at three reading levels
            — delivered only when every claim verifies against your input.
          </p>
        </div>

        <ExplainForm />

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent jobs
          </h2>
          <RecentJobs jobs={jobs} />
        </section>
      </div>
    </div>
  );
}
