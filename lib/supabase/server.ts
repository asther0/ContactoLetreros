import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { requireSupabasePublicConfig } from "./config";

/**
 * Creates a server-side client scoped to the supplied authenticated user's JWT.
 * Route handlers must obtain the token from a trusted cookie/session, never from
 * arbitrary request JSON.
 */
export function createServerSupabaseClient(accessToken?: string) {
  const { url, publishableKey } = requireSupabasePublicConfig();

  return createClient<Database>(url, publishableKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
