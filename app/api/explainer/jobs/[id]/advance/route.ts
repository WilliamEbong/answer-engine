import { JobNotFoundError, advance } from "@/lib/explainer/orchestrate";

/**
 * POST /api/explainer/jobs/[id]/advance — run exactly ONE wave of the job's
 * state machine; the client polls this until a terminal status (§2 locked
 * decision: client-driven state machine). Auth is enforced by middleware.ts.
 *
 * A row whose status lands on 'error' is a PERSISTED state (resumable via the
 * next advance), not an HTTP failure — it returns 200 with the row.
 */

export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const job = await advance(id);
    return Response.json({ job });
  } catch (err) {
    if (err instanceof JobNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error(`[/api/explainer/jobs/${id}/advance] failed:`, err);
    return Response.json({ error: "advance failed" }, { status: 500 });
  }
}
