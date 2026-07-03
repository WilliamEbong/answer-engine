import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getThread, insertExchange } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";
import { SearchError } from "@/lib/search";
import {
  titleFromQuestion,
  type AnswerUIMessage,
  type ChatRequestBody,
  type HistoryTurn,
  type Source,
} from "@/lib/types";

/**
 * POST /api/chat — the core streaming endpoint (BUILD.md §6).
 * Auth is enforced by middleware.ts (401 without a valid session cookie).
 *
 * Stream shape (mirrors the Phase-0 mock exactly):
 *   1. data-thread part (thread id — generated here on first message)
 *   2. data-sources part (numbered sources) BEFORE any text (§6.6)
 *   3. token stream from the synthesis model
 * On finish: thread + user msg + assistant msg + sources persisted atomically (§6.7).
 */

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  // Load history server-side (§6.2) — the client's message list is not trusted.
  let history: HistoryTurn[] = [];
  let isNewThread = true;
  let threadId = typeof body.threadId === "string" ? body.threadId : undefined;

  if (threadId) {
    const thread = await getThread(threadId);
    if (thread) {
      isNewThread = false;
      history = thread.messages.map((m) => ({ role: m.role, content: m.content }));
    }
    // Thread id present but unknown (e.g. earlier persist failed): keep the id,
    // treat as a new thread so this exchange isn't lost.
  } else {
    threadId = crypto.randomUUID();
  }

  const resolvedThreadId = threadId;
  let streamedSources: Source[] = [];

  const stream = createUIMessageStream<AnswerUIMessage>({
    async execute({ writer }) {
      const run = await runPipeline({ question, history });
      streamedSources = run.sources;

      writer.write({ type: "data-thread", data: { id: resolvedThreadId } });
      writer.write({ type: "data-sources", data: run.sources });
      writer.merge(run.stream.toUIMessageStream());
    },
    onError(error) {
      console.error("[/api/chat] stream error:", error);
      if (error instanceof SearchError) return error.message;
      return "The answer could not be generated. Please try again.";
    },
    async onFinish({ responseMessage, isAborted }) {
      try {
        const answer = (responseMessage?.parts ?? [])
          .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
          .map((p) => p.text)
          .join("");
        // Persist only real exchanges — not errored/aborted empty answers.
        if (!answer || isAborted) return;
        await insertExchange({
          threadId: resolvedThreadId,
          isNewThread,
          title: isNewThread ? titleFromQuestion(question) : undefined,
          question,
          answer,
          sources: streamedSources,
        });
      } catch (err) {
        // The answer already reached the client; log, don't crash the stream.
        console.error("[/api/chat] persistence failed:", err);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
