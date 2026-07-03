"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { JobRow, SourceBlock } from "@/lib/explainer/types";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Paste-in form for /explain: primary material (required) plus optional
 * supporting material and metadata, each becoming one source block. On
 * success, navigates to the job view (which drives the advance loop).
 */
export function ExplainForm() {
  const router = useRouter();
  const [primary, setPrimary] = useState("");
  const [supporting, setSupporting] = useState("");
  const [metadata, setMetadata] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = primary.trim().length > 0 && !pending;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);

    const blocks: Array<Pick<SourceBlock, "role" | "content">> = [
      { role: "primary", content: primary.trim() },
    ];
    if (supporting.trim()) {
      blocks.push({ role: "supporting", content: supporting.trim() });
    }
    if (metadata.trim()) {
      blocks.push({ role: "metadata", content: metadata.trim() });
    }

    try {
      const res = await fetch("/api/explainer/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMaterial: { blocks } }),
      });
      const data = (await res.json().catch(() => null)) as {
        job?: JobRow;
        error?: string;
      } | null;
      if (!res.ok || !data?.job) {
        throw new Error(data?.error ?? `Job creation failed (${res.status})`);
      }
      // Keep `pending` true while the route transition happens.
      router.push(`/explain/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job creation failed");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="explain-primary" className="text-sm font-medium">
          Primary material
        </label>
        <Textarea
          id="explain-primary"
          required
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          placeholder="Paste the paper or document text to explain…"
          className="min-h-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="explain-supporting" className="text-sm font-medium">
          Supporting material{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="explain-supporting"
          value={supporting}
          onChange={(e) => setSupporting(e.target.value)}
          placeholder="Press releases, notes, prior analysis…"
          className="min-h-24"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="explain-metadata" className="text-sm font-medium">
          Metadata{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="explain-metadata"
          value={metadata}
          onChange={(e) => setMetadata(e.target.value)}
          placeholder="Title / authors / venue / date / link"
          className="min-h-16"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button type="submit" disabled={!canSubmit}>
          {pending && <Spinner className="size-3.5" />}
          {pending ? "Creating job…" : "Explain it"}
        </Button>
      </div>
    </form>
  );
}
