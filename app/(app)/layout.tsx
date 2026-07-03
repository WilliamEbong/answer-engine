import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";

/**
 * App shell for the answer engine routes: slim header + full-height main so
 * the thread view can pin its follow-up input to the bottom.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Answer Engine
        </Link>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/explain">Explain</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <PlusIcon className="size-4" />
              New thread
            </Link>
          </Button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
