/**
 * ============================================================================
 * CHAT ENDPOINT — SINGLE SOURCE OF TRUTH FOR THE CHAT TRANSPORT URL.
 *
 * Phase 1 (now):    "/api/mock-chat"  — Phase-0 mock fixture stream.
 * Phase 2 (flip):   "/api/chat"       — the real pipeline route (BUILD.md §6).
 *
 * Nothing else in the client references the endpoint; change it HERE only.
 * ============================================================================
 */
export const CHAT_ENDPOINT = "/api/mock-chat";
