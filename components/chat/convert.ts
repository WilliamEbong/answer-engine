import type { AnswerUIMessage, ThreadMessage } from "@/lib/types";

/**
 * Convert persisted ThreadMessages (from getThread) into the AnswerUIMessage
 * shape useChat expects as its initial `messages` value.
 * Assistant messages get their sources back as a data-sources part so the
 * sources row renders identically to a live stream.
 */
export function threadMessagesToUIMessages(
  messages: ThreadMessage[]
): AnswerUIMessage[] {
  return messages.map((m): AnswerUIMessage => {
    if (m.role === "assistant") {
      return {
        id: m.id,
        role: "assistant",
        parts: [
          { type: "data-sources", data: m.sources },
          { type: "text", text: m.content },
        ],
      };
    }
    return {
      id: m.id,
      role: "user",
      parts: [{ type: "text", text: m.content }],
    };
  });
}
