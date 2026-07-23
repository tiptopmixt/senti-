import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase per il browser.
 *
 * INVARIANTE DI SICUREZZA: nel client si usa SOLO la anon key pubblica
 * (NEXT_PUBLIC_*). La service_role key e OPENAI_API_KEY non entrano MAI nel
 * bundle: vivono solo come secret delle Edge Functions.
 *
 * Il client è creato in modo lazy (singleton) così l'export statico non fallisce
 * in assenza delle variabili: l'errore scatta solo quando il client viene usato.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Variabili NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY mancanti. " +
        "Configurale in .env.local (vedi .env.local.example).",
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
