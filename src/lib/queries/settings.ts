import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Limiti dell'applicazione, letti dal database (app_settings).
 *
 * Stanno lì e non nel codice perché durante il pilota andranno ritoccati.
 */
const limiteSchema = z.object({
  chiave: z.string(),
  valore: z.number().int(),
});

export interface Limiti {
  testoLunghezzaMassima: number;
  ritrovamentiPerMese: number;
}

/** Valori di sicurezza se il database non risponde. */
export const LIMITI_PREDEFINITI: Limiti = {
  testoLunghezzaMassima: 1500,
  ritrovamentiPerMese: 60,
};

export async function leggiLimiti(): Promise<Limiti> {
  const { data, error } = await getSupabaseClient()
    .from("app_settings")
    .select("chiave, valore");

  if (error || !data) return LIMITI_PREDEFINITI;

  const righe = limiteSchema.array().safeParse(data);
  if (!righe.success) return LIMITI_PREDEFINITI;

  const mappa = new Map(righe.data.map((r) => [r.chiave, r.valore]));
  return {
    testoLunghezzaMassima: LIMITI_PREDEFINITI.testoLunghezzaMassima,
    ritrovamentiPerMese:
      mappa.get("ritrovamenti_al_mese") ?? LIMITI_PREDEFINITI.ritrovamentiPerMese,
  };
}
