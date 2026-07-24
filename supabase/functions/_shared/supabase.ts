import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Client con service_role: usato SOLO dentro le Edge Functions.
 *
 * INVARIANTE: la service_role key non esce mai da qui. Non deve comparire nel
 * bundle client. Scavalca la RLS, quindi ogni funzione che la usa è responsabile
 * di applicare da sé i controlli (es. consenso del narratore).
 */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY mancanti nei secret della funzione",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** SHA-256 esadecimale, usato per i fingerprint di cache. */
export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
