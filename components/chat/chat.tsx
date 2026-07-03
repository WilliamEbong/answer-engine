"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnswerUIMessage, ChatRequestBody, Source } from "@/lib/types";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatStatus } from "ai";
import { RotateCcwIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { AnswerMarkdown } from "./answer-markdown";
import { CHAT_ENDPOINT } from "./endpoint";
import { QueryInput } from "./query-input";
import { SourcesRow, SourcesRowSkeleton } from "./sources-row";

/**
 * The client chat surface, used by both routes:
 * - `/`        : hero mode (centered input + `children` = recent threads)
 *                until the first message is sent, then conversation mode.
 * - `/t/[id]`  : conversation mode seeded with server-loaded messages.
 *
 * On the `data-thread` stream part, when we are still on `/`, the URL is
 * swapped to `/t/{id}` via history.replaceState — never router.push, which
 * would remount the tree mid-stream.
 */
export function Chat({
  threadId,
  initialMessages,
  threadMissing = false,
  children,
}: {
  threadId?: string;
  initialMessages?: AnswerUIMessage[] | null;
  /** True when /t/[id] could not load the thread (missing or DB not ready). */
  threadMissing?: boolean;
  children?: ReactNode;
}) {
  // Current thread id; updated from the data-thread part on first exchange.
  const threadIdRef = useRef<string | undefined>(threadId);

  // Transport is created once; prepareSendMessagesRequest reads the ref so
  // follow-up requests carry the thread id assigned mid-stream.
  const [transport] = useState(
    () =>
      new DefaultChatTransport<AnswerUIMessage>({
        api: CHAT_ENDPOINT,
        prepareSendMessagesRequest: ({ messages, body }) => {
          const lastUser = [...messages]
            .reverse()
            .find((m) => m.role === "user");
          const question =
            lastUser?.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("") ?? "";
          const requestBody: ChatRequestBody & {
            messages: AnswerUIMessage[];
          } = {
            ...body,
            threadId: threadIdRef.current,
            question,
            messages,
          };
          return { body: requestBody };
        },
      })
  );

  const { messages, sendMessage, status, error, regenerate } =
    useChat<AnswerUIMessage>({
      id: threadId,
      transport,
      messages: initialMessages ?? undefined,
      onData: (part) => {
        if (part.type === "data-thread") {
          threadIdRef.current = part.data.id;
          if (window.location.pathname === "/") {
            window.history.replaceState(null, "", `/t/${part.data.id}`);
          }
        }
      },
    });

  const ask = (text: string) => {
    void sendMessage({ text });
  };

  // ---- Hero mode: nothing asked yet -------------------------------------
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pb-16 pt-24 sm:pt-32">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              What do you want to know?
            </h1>
            <p className="text-sm text-muted-foreground">
              Ask anything and get an answer with cited sources.
            </p>
          </div>
          <QueryInput onSubmit={ask} status={status} autoFocus />
          {threadMissing && (
            <p className="rounded-lg border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
              This thread could not be loaded — it may not exist yet. You can
              start a new question above.
            </p>
          )}
          {children}
        </div>
      </div>
    );
  }

  // ---- Conversation mode -------------------------------------------------
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistant =
    status === "submitted" && lastMessage?.role === "user";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-8 px-4 py-8">
          {messages.map((message, i) =>
            message.role === "user" ? (
              <Message from="user" key={message.id}>
                <MessageContent>
                  {message.parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text)
                    .join("")}
                </MessageContent>
              </Message>
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                isLast={i === messages.length - 1}
                status={status}
              />
            )
          )}
          {awaitingAssistant && <PendingAnswer />}
          {error && (
            <StreamErrorCard error={error} onRetry={() => void regenerate()} />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Follow-up input pinned to the bottom of the thread view */}
      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <QueryInput
            onSubmit={ask}
            status={status}
            placeholder="Ask a follow-up…"
          />
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  isLast,
  status,
}: {
  message: AnswerUIMessage;
  isLast: boolean;
  status: ChatStatus;
}) {
  const sources = message.parts.find((p) => p.type === "data-sources")?.data as
    | Source[]
    | undefined;
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
  const live =
    isLast && (status === "streaming" || status === "submitted");

  return (
    <Message from="assistant">
      <MessageContent className="w-full gap-4">
        {sources && sources.length > 0 ? (
          <SourcesRow msgId={message.id} sources={sources} />
        ) : live ? (
          <SourcesRowSkeleton />
        ) : null}
        {text ? (
          <div>
            <AnswerMarkdown msgId={message.id} text={text} sources={sources} />
            {live && status === "streaming" && (
              <span
                aria-hidden
                className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-foreground/60 align-text-bottom"
              />
            )}
          </div>
        ) : live ? (
          <AnswerTextSkeleton />
        ) : null}
      </MessageContent>
    </Message>
  );
}

/** Assistant placeholder shown between submit and the first stream parts. */
function PendingAnswer() {
  return (
    <Message from="assistant">
      <MessageContent className="w-full gap-4">
        <SourcesRowSkeleton />
        <AnswerTextSkeleton />
      </MessageContent>
    </Message>
  );
}

function AnswerTextSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

/** Inline, destructive-tinted error card — the stream never dies silently. */
function StreamErrorCard({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <p className="font-medium text-destructive">
        Something went wrong while answering
      </p>
      <p className="break-words text-muted-foreground">
        {error.message || "The answer stream failed."} Check your connection
        and try again.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcwIcon className="size-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );
}
