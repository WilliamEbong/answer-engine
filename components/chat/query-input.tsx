"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { ArrowUpIcon } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

/**
 * Shared query input — the home hero input and the thread follow-up input.
 * Enter submits, Shift+Enter inserts a newline.
 */
export function QueryInput({
  onSubmit,
  status,
  placeholder = "Ask anything…",
  autoFocus = false,
  className,
}: {
  onSubmit: (text: string) => void;
  status: ChatStatus;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
    setValue("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "relative rounded-xl border border-input bg-card shadow-sm transition-colors focus-within:border-ring",
        className
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        aria-label="Ask a question"
        className="max-h-48 min-h-14 w-full resize-none border-0 bg-transparent py-4 pl-4 pr-14 text-sm shadow-none field-sizing-content focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Send question"
        disabled={busy || value.trim().length === 0}
        className="absolute bottom-2.5 right-2.5 rounded-lg"
      >
        {busy ? <Spinner className="size-4" /> : <ArrowUpIcon className="size-4" />}
      </Button>
    </form>
  );
}
