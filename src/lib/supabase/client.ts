import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser-only client. The session persists in localStorage so it survives offline launches. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
