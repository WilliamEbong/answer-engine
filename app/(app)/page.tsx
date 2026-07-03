import { Chat } from "@/components/chat/chat";
import { ThreadList } from "@/components/chat/thread-list";
import { listThreads } from "@/lib/db";
import type { ThreadMeta } from "@/lib/types";

// Thread list must always be fresh (and lib/db needs runtime env).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let threads: ThreadMeta[] = [];
  try {
    threads = await listThreads(20);
  } catch {
    // DB layer not ready / unreachable — degrade to an empty list (§8).
  }

  return (
    <Chat>
      <ThreadList threads={threads} />
    </Chat>
  );
}
