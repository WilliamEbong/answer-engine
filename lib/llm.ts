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

/**
 * Explainer model tiers (EXPLAINER-BUILD.md §2/§8). Every tier falls back to
 * LLM_MODEL, so unset tier envs reproduce v1 behavior exactly.
 */
export type ModelTier = "small" | "mid" | "strong";

/** Resolve a tier to its configured model id (falls back to LLM_MODEL). */
export function getModelId(tier?: ModelTier): string {
  const env = getEnv();
  switch (tier) {
    case "small":
      return env.LLM_MODEL_SMALL ?? env.LLM_MODEL;
    case "mid":
      return env.LLM_MODEL_MID ?? env.LLM_MODEL;
    case "strong":
      return env.LLM_MODEL_STRONG ?? env.LLM_MODEL;
    default:
      return env.LLM_MODEL;
  }
}

/** Resolve the configured chat model lazily from env (cached after first call). */
export function getModel(tier?: ModelTier): LanguageModel {
  if (!registry) registry = buildRegistry();
  const env = getEnv();
  return registry.languageModel(`${env.LLM_PROVIDER}:${getModelId(tier)}`);
}
