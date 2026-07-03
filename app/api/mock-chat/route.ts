import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { Source } from "@/lib/types";

/**
 * PHASE-0 MOCK FIXTURE (main agent) — Agent C develops the UI against this
 * route; Phase 2 swaps the client transport to the real POST /api/chat.
 * Emits the exact stream shape the real route will produce:
 *   1. data-thread part (thread id)
 *   2. data-sources part (numbered sources) — BEFORE any text
 *   3. streamed markdown text with inline bare [n] citations
 *
 * DO NOT DELETE until Phase 2 integration is complete.
 */

const MOCK_SOURCES: Source[] = [
  { position: 1, title: "Understanding Transformers", url: "https://example.com/transformers", snippet: "The transformer architecture relies on self-attention mechanisms to process sequences in parallel..." },
  { position: 2, title: "Attention Is All You Need — Paper Summary", url: "https://arxiv.org/abs/1706.03762", snippet: "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms..." },
  { position: 3, title: "A Gentle Introduction to LLMs", url: "https://developer.mozilla.org/llm-intro", snippet: "Large language models are trained on vast corpora of text to predict the next token..." },
  { position: 4, title: "Scaling Laws for Neural Language Models", url: "https://openai.com/research/scaling-laws", snippet: "Model performance improves predictably as a power law with model size, dataset size, and compute..." },
  { position: 5, title: "The Illustrated Transformer", url: "https://jalammar.github.io/illustrated-transformer/", snippet: "A visual walkthrough of how attention heads, embeddings and positional encodings interact..." },
];

const MOCK_ANSWER = `Transformers are a neural network architecture built entirely around **self-attention**, which lets the model weigh every token against every other token in parallel rather than sequentially[1][2]. This parallelism is what made large-scale pretraining practical[2].

Key ideas:

- **Self-attention** computes query/key/value projections for each token and mixes information across the whole sequence in a single step[1][5].
- **Positional encodings** inject word-order information that attention alone would lose[5].
- **Scaling laws** show performance improves predictably as parameters, data and compute grow[4].

Modern large language models are transformers trained on vast text corpora to predict the next token[3]. Note that source [3] is a general introduction and covers the training objective only at a high level — for architectural detail, sources [1], [2] and [5] are more authoritative.`;

export async function POST(): Promise<Response> {
  const threadId = "00000000-0000-4000-8000-000000000mock";

  const stream = createUIMessageStream({
    async execute({ writer }) {
      // 1. thread id early
      writer.write({ type: "data-thread", data: { id: threadId } });

      // brief "searching" pause so skeleton states are visible
      await sleep(900);

      // 2. sources BEFORE text
      writer.write({ type: "data-sources", data: MOCK_SOURCES });

      await sleep(300);

      // 3. word-by-word text stream
      const id = "mock-text";
      writer.write({ type: "text-start", id });
      for (const word of MOCK_ANSWER.split(/(?<=\s)/)) {
        writer.write({ type: "text-delta", id, delta: word });
        await sleep(18);
      }
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
