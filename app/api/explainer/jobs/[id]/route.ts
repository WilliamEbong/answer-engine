import { getJob } from "@/lib/explainer/db";

/**
 * GET /api/explainer/jobs/[id] — full job row (status, checkpoints, artifact,
 * qa_report, usage). Auth is enforced by middleware.ts.
 */

export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const job = await getJob(id);
    if (!job) {
      return Response.json({ error: "job not found" }, { status: 404 });
    }
    return Response.json({ job });
  } catch (err) {
    console.error(`[/api/explainer/jobs/${id}] fetch failed:`, err);
    return Response.json({ error: "job fetch failed" }, { status: 500 });
  }
}
