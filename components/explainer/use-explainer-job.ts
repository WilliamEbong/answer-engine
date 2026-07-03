"use client";

import { isTerminal, type JobRow } from "@/lib/explainer/types";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-driven state machine for a single explainer job (EXPLAINER-BUILD.md
 * §2): POST /advance runs exactly one wave; this hook loops advances until the
 * job reaches a terminal status, a persisted `error` status (waits for a
 * manual retry), or a transport failure (phase "failed", also retryable).
 */

export type JobPhase = "advancing" | "idle" | "failed";

interface HookState {
  job: JobRow;
  phase: JobPhase;
  error?: string;
}

/** The loop keeps advancing only for non-terminal, non-error statuses. */
function shouldAdvance(job: JobRow): boolean {
  return !isTerminal(job.status) && job.status !== "error";
}

export function useExplainerJob(jobId: string, initialJob: JobRow) {
  const [state, setState] = useState<HookState>(() => ({
    job: initialJob,
    phase: shouldAdvance(initialJob) ? "advancing" : "idle",
  }));

  // Latest job independent of render timing; the loop reads/writes this.
  const jobRef = useRef<JobRow>(initialJob);
  // Set on unmount; every await in the loop checks it before touching state.
  const cancelledRef = useRef(false);
  // StrictMode guard: the double-invoked effect must not start a second loop.
  const startedRef = useRef(false);
  // Re-entrancy guard shared by the effect loop and retry().
  const loopRunningRef = useRef(false);

  const advanceOnce = useCallback(async (): Promise<JobRow> => {
    const res = await fetch(`/api/explainer/jobs/${jobId}/advance`, {
      method: "POST",
    });
    if (!res.ok) {
      let message = `Advance failed (HTTP ${res.status})`;
      try {
        const data: unknown = await res.json();
        if (
          data !== null &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
        ) {
          message = (data as { error: string }).error;
        }
      } catch {
        // Non-JSON error body — keep the HTTP message.
      }
      throw new Error(message);
    }
    const { job } = (await res.json()) as { job: JobRow };
    return job;
  }, [jobId]);

  /** One re-sync GET after a failed advance — the wave may have completed. */
  const refetch = useCallback(async (): Promise<JobRow | null> => {
    try {
      const res = await fetch(`/api/explainer/jobs/${jobId}`);
      if (!res.ok) return null;
      const { job } = (await res.json()) as { job: JobRow | null };
      return job ?? null;
    } catch {
      return null;
    }
  }, [jobId]);

  const loop = useCallback(async (): Promise<void> => {
    if (loopRunningRef.current) return;
    loopRunningRef.current = true;
    try {
      while (!cancelledRef.current && shouldAdvance(jobRef.current)) {
        try {
          const job = await advanceOnce();
          if (cancelledRef.current) return;
          jobRef.current = job;
          setState({ job, phase: shouldAdvance(job) ? "advancing" : "idle" });
        } catch (err) {
          const fresh = await refetch();
          if (cancelledRef.current) return;
          if (
            fresh &&
            (fresh.status !== jobRef.current.status ||
              fresh.updated_at !== jobRef.current.updated_at)
          ) {
            // The advance actually landed server-side — resume from it.
            jobRef.current = fresh;
            setState({
              job: fresh,
              phase: shouldAdvance(fresh) ? "advancing" : "idle",
            });
            continue;
          }
          setState({
            job: jobRef.current,
            phase: "failed",
            error:
              err instanceof Error ? err.message : "Could not advance the job.",
          });
          return;
        }
      }
    } finally {
      loopRunningRef.current = false;
    }
  }, [advanceOnce, refetch]);

  /**
   * Manual retry: one advance, then resume the loop. Covers both a persisted
   * status === 'error' row (advance re-runs the failed wave) and a transport
   * failure (phase "failed").
   */
  const retry = useCallback(async (): Promise<void> => {
    if (loopRunningRef.current) return;
    setState({ job: jobRef.current, phase: "advancing" });
    try {
      const job = await advanceOnce();
      if (cancelledRef.current) return;
      jobRef.current = job;
      setState({ job, phase: shouldAdvance(job) ? "advancing" : "idle" });
      if (shouldAdvance(job)) void loop();
    } catch (err) {
      if (cancelledRef.current) return;
      setState({
        job: jobRef.current,
        phase: "failed",
        error:
          err instanceof Error ? err.message : "Could not advance the job.",
      });
    }
  }, [advanceOnce, loop]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!startedRef.current) {
      startedRef.current = true;
      if (shouldAdvance(jobRef.current)) void loop();
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [loop]);

  return { job: state.job, phase: state.phase, error: state.error, retry };
}
