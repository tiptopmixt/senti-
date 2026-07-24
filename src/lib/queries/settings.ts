import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Limiti dell'applicazione, letti dal database.
 *
 * Stanno lì e non nel codice perché durante il pilota andranno ritoccati.
 * Il client li legge per poterli MOSTRARE prima che l'utente registri: un
 * limite scoperto dopo, sbattendoci contro, è tempo perso e una testimonianza
 * potenzialmente persa.
 */
const limiteSchema = z.object({
  chiave: z.string(),
  valore: z.number().int(),
});

export interface Limiti {
  audioDurataMassimaMs: number;
  testoLunghezzaMassima: number;
  contributiPerMese: number;
}

/** Valori di sicurezza se il database non risponde: meglio prudenti. */
export const LIMITI_PREDEFINITI: Limiti = {
  audioDurataMassimaMs: 180_000,
  testoLunghezzaMassima: 1500,
  contributiPerMese: 20,
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
    audioDurataMassimaMs:
      mappa.get("audio_durata_massima_ms") ?? LIMITI_PREDEFINITI.audioDurataMassimaMs,
    testoLunghezzaMassima:
      mappa.get("testo_lunghezza_massima") ?? LIMITI_PREDEFINITI.testoLunghezzaMassima,
    contributiPerMese:
      mappa.get("contributi_per_mese") ?? LIMITI_PREDEFINITI.contributiPerMese,
  };
}

/** Quanti contributi restano all'utente corrente questo mese. */
export async function contributiRimanenti(): Promise<number | null> {
  const { data, error } = await getSupabaseClient().rpc("contributi_rimanenti");
  if (error) return null;
  const n = z.number().int().safeParse(data);
  return n.success ? n.data : null;
}
