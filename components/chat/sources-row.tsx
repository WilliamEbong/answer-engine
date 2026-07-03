import { Skeleton } from "@/components/ui/skeleton";
import type { Source } from "@/lib/types";
import { domainOf, faviconUrl, sourceAnchorId } from "./citations";

/**
 * Horizontal, scrollable row of compact source cards rendered ABOVE the
 * answer text. Each card carries id `source-{msgId}-{n}` so inline citation
 * chips can hash-link to it; `target:` styles highlight the linked card.
 */
export function SourcesRow({
  msgId,
  sources,
}: {
  msgId: string;
  sources: Source[];
}) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Sources · {sources.length}
      </span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sources.map((s) => (
          <a
            key={s.position}
            id={sourceAnchorId(msgId, s.position)}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            title={s.title ?? s.url}
            className="flex w-44 shrink-0 scroll-mt-24 flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-accent target:ring-2 target:ring-ring"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconUrl(s.url)}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                className="size-4 shrink-0 rounded-sm"
              />
              <span className="truncate text-xs text-muted-foreground">
                {domainOf(s.url)}
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground/70">
                {s.position}
              </span>
            </span>
            <span className="line-clamp-2 text-xs font-medium leading-snug text-card-foreground">
              {s.title ?? s.url}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Placeholder cards shown while the pipeline is still searching. */
export function SourcesRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <span className="text-xs font-medium text-muted-foreground">
        Searching sources…
      </span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex w-44 shrink-0 flex-col gap-2 rounded-lg border border-border bg-card p-2.5"
          >
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
