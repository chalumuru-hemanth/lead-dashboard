// Server-side only. Uses the service_role key, which bypasses RLS -- never
// import this from a "use client" component or expose it to the browser.
import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
