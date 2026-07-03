import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ProviderV3 } from "@ai-sdk/provider";
import { createProviderRegistry, type LanguageModel } from "ai";
import { getEnv } from "./env";

/**
 * FROZEN SIGNATURE (BUILD.md §4) — implementation owned by Agent A (Phase 1).
 *
 * The ONLY module (with lib/search.ts) allowed to import provider SDKs.
 * Env-driven via lib/env.ts: LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL / LLM_API_KEY.
 *
 * NEVER set temperature / topP / topK anywhere (claude-sonnet-5 rejects
 * non-default sampling params with HTTP 400). Size maxOutputTokens generously.
 */

type Registry = ReturnType<typeof createProviderRegistry>;

let registry: Registry | undefined;

function buildRegistry(): Registry {
  const env = getEnv();
  const apiKey = env.LLM_API_KEY;

  const providers: Record<string, ProviderV3> = {
    anthropic: createAnthropic({ apiKey }),
    openai: createOpenAI({ apiKey }),
    google: createGoogleGenerativeAI({ apiKey }),
    openrouter: createOpenRouter({ apiKey }),
  };

  // openai-compatible requires a base URL; only register it when configured
  // (a dummy API key is allowed for local endpoints).
  if (env.LLM_BASE_URL) {
    providers["openai-compatible"] = createOpenAICompatible({
      name: "openai-compatible",
      apiKey,
      baseURL: env.LLM_BASE_URL,
    });
  }

  return createProviderRegistry(providers);
}

/** Resolve the configured chat model lazily from env (cached after first call). */
export function getModel(): LanguageModel {
  if (!registry) registry = buildRegistry();
  const env = getEnv();
  return registry.languageModel(`${env.LLM_PROVIDER}:${env.LLM_MODEL}`);
}
