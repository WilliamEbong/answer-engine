import { Chat } from "@/components/chat/chat";
import { threadMessagesToUIMessages } from "@/components/chat/convert";
import { getThread } from "@/lib/db";
import type { ThreadDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let thread: ThreadDetail | null = null;
  try {
    thread = await getThread(id);
  } catch {
    // DB layer not ready / unreachable — degrade to a not-found state (§8).
  }

  const initialMessages = thread
    ? threadMessagesToUIMessages(thread.messages)
    : null;

  return (
    <Chat
      threadId={id}
      initialMessages={initialMessages}
      threadMissing={!thread}
    />
  );
}
