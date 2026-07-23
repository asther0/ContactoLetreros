import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { requireSupabaseAdminConfig } from "./config";

/**
 * Server-only escape hatch for trusted webhook and metering handlers.
 * Never import this module from client components or expose its key with NEXT_PUBLIC_.
 */
export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = requireSupabaseAdminConfig();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
