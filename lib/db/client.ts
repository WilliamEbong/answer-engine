import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

/**
 * SERVER-ONLY Supabase client using the SERVICE ROLE key.
 *
 * Never import this module (or anything under lib/db) from client components —
 * the service-role key must not reach the client bundle. (The `server-only`
 * package is not installed, so this is enforced by convention: lib/db is only
 * imported from route handlers and server components.)
 */

let client: SupabaseClient | undefined;

/** Lazily create (and cache) the service-role Supabase client. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}
