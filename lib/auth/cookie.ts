/**
 * FROZEN SIGNATURES (BUILD.md §2 Auth) — implementation owned by Agent D (Phase 1).
 *
 * HMAC-signed httpOnly session cookie, 30-day validity. No accounts.
 * MUST be Edge-runtime compatible (middleware.ts runs on Edge): use Web Crypto
 * (crypto.subtle HMAC-SHA256), NOT node:crypto.
 *
 * Cookie value shape (suggested): `${expiresEpochMs}.${hexSignature}` where
 * signature = HMAC(secret, String(expiresEpochMs)).
 */

export const SESSION_COOKIE = "ae_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Create a signed cookie value valid for SESSION_TTL_MS from now. */
export function createSessionValue(secret: string): Promise<string> {
  void secret;
  throw new Error("lib/auth/cookie.ts not implemented yet (Phase 1, Agent D)");
}

/** Verify a cookie value: valid signature and not expired. */
export function verifySessionValue(value: string | undefined, secret: string): Promise<boolean> {
  void value;
  void secret;
  throw new Error("lib/auth/cookie.ts not implemented yet (Phase 1, Agent D)");
}
