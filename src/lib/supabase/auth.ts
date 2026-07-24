import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

/**
 * Sessione anonima: nessuna schermata di accesso, nessuna registrazione.
 *
 * Alla prima apertura crea una sessione anonima Supabase. L'`user_id` è reale:
 * RLS e ledger dei punti funzionano esattamente come in produzione. In futuro
 * `linkIdentity` permetterà di passare a un'email conservando i punti maturati.
 */
export async function ensureSession(): Promise<Session> {
  const supabase = getSupabaseClient();

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(
      `Impossibile creare la sessione anonima: ${error?.message ?? "sessione assente"}`,
    );
  }
  return data.session;
}

/** Id dell'utente corrente, o null se non c'è ancora una sessione. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.user.id ?? null;
}
