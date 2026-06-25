import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let cached: SupabaseClient | null = null;
let testClient: SupabaseClient | null = null;

export function setSupabaseAdminForTests(client: SupabaseClient | null): void {
  testClient = client;
}

export function supabaseAdmin(): SupabaseClient {
  if (testClient) return testClient;
  if (cached) return cached;
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
