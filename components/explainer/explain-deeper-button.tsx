"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { JobRow } from "@/lib/explainer/types";
import { BookOpenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Explain deeper" action on an answered thread: creates an explainer job
 * from the thread (the server bridge enriches its sources to full text) and
 * navigates to the job view.
 */
export function ExplainDeeperButton({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createJob = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/explainer/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data = (await res.json().catch(() => null)) as {
        job?: JobRow;
        error?: string;
      } | null;
      if (!res.ok || !data?.job) {
        throw new Error(data?.error ?? `Job creation failed (${res.status})`);
      }
      router.push(`/explain/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job creation failed");
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void createJob()}
        disabled={pending}
      >
        {pending ? (
          <Spinner className="size-3.5" />
        ) : (
          <BookOpenIcon className="size-3.5" />
        )}
        Explain deeper
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
