"use client";

import type { Source } from "@/lib/types";
import { useMemo } from "react";
import { Streamdown, type Components } from "streamdown";
import { domainOf, linkifyCitations } from "./citations";

/**
 * Streamed markdown answer with inline [n] citation chips.
 *
 * Bare [n] markers in the raw markdown are pre-processed into hash-links
 * ([n](#source-{msgId}-{n})) — see citations.ts — and the `a` component
 * override renders those hash-links as superscript chips that jump to the
 * matching source card and show title/domain on hover. Regular links render
 * as normal external links.
 */
export function AnswerMarkdown({
  msgId,
  text,
  sources,
}: {
  msgId: string;
  text: string;
  sources: Source[] | undefined;
}) {
  const processed = useMemo(
    () => linkifyCitations(text, msgId, sources),
    [text, msgId, sources]
  );

  const components = useMemo<Components>(() => {
    const anchorPrefix = `#source-${msgId}-`;
    return {
      a: ({ href, children, node: _node, ...props }) => {
        if (href?.startsWith(anchorPrefix)) {
          const n = Number(href.slice(anchorPrefix.length));
          const source = sources?.find((s) => s.position === n);
          const domain = source ? domainOf(source.url) : undefined;
          const hover = source
            ? source.title
              ? `${source.title} — ${domain}`
              : domain
            : undefined;
          return (
            <sup className="ml-0.5">
              <a
                href={href}
                title={hover}
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-secondary px-1 align-baseline text-xs font-medium leading-none text-secondary-foreground no-underline transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {children}
              </a>
            </sup>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
            {...props}
          >
            {children}
          </a>
        );
      },
    };
  }, [msgId, sources]);

  return (
    <Streamdown
      components={components}
      className="max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
    >
      {processed}
    </Streamdown>
  );
}
