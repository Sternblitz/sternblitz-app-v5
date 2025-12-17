import { createClient } from "@supabase/supabase-js";

let adminClient;

export function supabaseAdmin() {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error("Supabase Server: Fehlende Umgebungsvariablen (URL oder SERVICE_ROLE_KEY)");
    }

    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
