export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export interface SupabaseAdminConfig extends SupabasePublicConfig {
  serviceRoleKey: string;
}

function read(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = read(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = read(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return url && publishableKey ? { url, publishableKey } : null;
}

export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return config;
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig | null {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = read(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return publicConfig && serviceRoleKey
    ? { ...publicConfig, serviceRoleKey }
    : null;
}

export function requireSupabaseAdminConfig(): SupabaseAdminConfig {
  const config = getSupabaseAdminConfig();

  if (!config) {
    throw new Error(
      "Supabase admin is not configured. SUPABASE_SERVICE_ROLE_KEY must only " +
        "exist in the server environment.",
    );
  }

  return config;
}
