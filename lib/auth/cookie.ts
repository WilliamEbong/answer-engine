/**
 * HMAC-signed httpOnly session cookie, 30-day validity. No accounts.
 * (BUILD.md §2 Auth — implemented by Agent D, Phase 1.)
 *
 * Edge-runtime compatible (middleware.ts runs on Edge): uses Web Crypto
 * (crypto.subtle HMAC-SHA256), NOT node:crypto.
 *
 * Cookie value shape: `${expiresEpochMs}.${hexSignature}` where
 * hexSignature = HMAC-SHA256(secret, String(expiresEpochMs)).
 */

export const SESSION_COOKIE = "ae_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a signed cookie value valid for SESSION_TTL_MS from now. */
export async function createSessionValue(secret: string): Promise<string> {
  const expiresEpochMs = Date.now() + SESSION_TTL_MS;
  const sig = await hmacHex(secret, String(expiresEpochMs));
  return `${expiresEpochMs}.${sig}`;
}

/** Verify a cookie value: valid signature and not expired. Never throws. */
export async function verifySessionValue(
  value: string | undefined,
  secret: string,
): Promise<boolean> {
  try {
    if (!value || !secret) return false;

    const dot = value.indexOf(".");
    if (dot <= 0) return false;
    const expiresStr = value.slice(0, dot);
    const providedSig = value.slice(dot + 1);

    // Strict shape checks: digits-only timestamp, 64 lowercase hex chars (SHA-256).
    if (!/^\d{1,15}$/.test(expiresStr)) return false;
    if (!/^[0-9a-f]{64}$/.test(providedSig)) return false;

    const expectedSig = await hmacHex(secret, expiresStr);

    // Constant-time-ish compare (timingSafeEqual is node-only; both strings
    // are guaranteed 64 chars at this point, so XOR over every char).
    let diff = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      diff |= expectedSig.charCodeAt(i) ^ providedSig.charCodeAt(i);
    }
    if (diff !== 0) return false;

    return Number(expiresStr) > Date.now();
  } catch {
    return false;
  }
}
