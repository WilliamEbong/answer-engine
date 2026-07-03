import type { LanguageModel } from "ai";

/**
 * FROZEN SIGNATURE (BUILD.md §4) — implementation owned by Agent A (Phase 1).
 *
 * The ONLY module (with lib/search.ts) allowed to import provider SDKs.
 * Env-driven via lib/env.ts: LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL / LLM_API_KEY.
 *
 * Implementation notes (from Morphic recon, AI SDK v6):
 * - Build a `createProviderRegistry({...})` covering: anthropic, openai, google,
 *   openrouter (@openrouter/ai-sdk-provider), openai-compatible
 *   (createOpenAICompatible with LLM_BASE_URL; dummy API key allowed).
 * - Return registry.languageModel(`${LLM_PROVIDER}:${LLM_MODEL}`).
 * - NEVER set temperature / topP / topK anywhere (claude-sonnet-5 rejects
 *   non-default sampling params with HTTP 400). Size maxOutputTokens generously.
 */
export function getModel(): LanguageModel {
  // TODO(Agent A): implement per notes above.
  throw new Error("lib/llm.ts not implemented yet (Phase 1, Agent A)");
}
