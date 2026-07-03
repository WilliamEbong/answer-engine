import type { ThreadMeta } from "@/lib/types";
import { MessageSquareTextIcon } from "lucide-react";
import Link from "next/link";
import { relativeTime } from "./relative-time";

/**
 * Recent-threads list for the home page. Server-rendered (passed as children
 * into the client Chat component, so it only shows in the hero state).
 */
export function ThreadList({ threads }: { threads: ThreadMeta[] }) {
  if (threads.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No threads yet — ask your first question above and it will show up
        here.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent threads
      </h2>
      <ul className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
        {threads.map((t) => (
          <li key={t.id}>
            <Link
              href={`/t/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
            >
              <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm">{t.title}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {relativeTime(t.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
