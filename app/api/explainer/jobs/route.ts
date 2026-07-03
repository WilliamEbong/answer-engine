import { z } from "zod";
import { listJobs } from "@/lib/explainer/db";
import { buildSourceMaterialFromThread } from "@/lib/explainer/from-thread";
import { createExplainerJob } from "@/lib/explainer/orchestrate";
import type { SourceMaterial } from "@/lib/explainer/types";

/**
 * POST /api/explainer/jobs — create a job (idempotent on jobId).
 * GET  /api/explainer/jobs — recent jobs (lightweight list items).
 * Auth is enforced by middleware.ts — no auth code here.
 */

export const maxDuration = 60;

const bodySchema = z.object({
  jobId: z.string().min(1).optional(),
  threadId: z.uuid().optional(),
  sourceMaterial: z.unknown().optional(),
  config: z.unknown().optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  const hasSourceMaterial = body.sourceMaterial !== undefined;
  const hasThreadId = body.threadId !== undefined;
  if (hasSourceMaterial === hasThreadId) {
    return Response.json(
      { error: "provide exactly one of sourceMaterial or threadId" },
      { status: 400 },
    );
  }

  try {
    let sourceMaterial: unknown = body.sourceMaterial;
    if (hasThreadId) {
      sourceMaterial = await buildSourceMaterialFromThread(body.threadId!);
      if (sourceMaterial === null) {
        return Response.json({ error: "thread not found" }, { status: 404 });
      }
    }

    const { job, created } = await createExplainerJob({
      jobId: body.jobId,
      threadId: body.threadId,
      sourceMaterial: sourceMaterial as SourceMaterial,
      config: body.config,
    });
    return Response.json({ job, created }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: z.prettifyError(err) }, { status: 400 });
    }
    console.error("[/api/explainer/jobs] create failed:", err);
    return Response.json({ error: "job creation failed" }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  try {
    return Response.json({ jobs: await listJobs() });
  } catch (err) {
    console.error("[/api/explainer/jobs] list failed:", err);
    return Response.json({ error: "job list failed" }, { status: 500 });
  }
}
