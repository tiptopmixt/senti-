import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Consensi e informative.
 *
 * Livello "una volta sola": termini (si accettano), privacy (informativa da
 * leggere), cookie (scelta modificabile). Tutto legato a user_id + versione.
 * Se una versione cambia, stato_consensi la ripropone (da_mostrare = true).
 */

const statoDocSchema = z.object({
  versione_attiva: z.number().int(),
  versione_accettata: z.number().int().nullable(),
  da_mostrare: z.boolean(),
  dettaglio: z.record(z.string(), z.unknown()).nullable(),
});
const statoConsensiSchema = z.object({
  termini: statoDocSchema.optional(),
  privacy: statoDocSchema.optional(),
  cookie: statoDocSchema.optional(),
});
export type StatoConsensi = z.infer<typeof statoConsensiSchema>;

export async function statoConsensi(): Promise<StatoConsensi> {
  const { data, error } = await getSupabaseClient().rpc("stato_consensi");
  if (error) throw new Error(`Lettura consensi fallita: ${error.message}`);
  return statoConsensiSchema.parse(data ?? {});
}

export type TipoDoc = "termini" | "privacy" | "cookie" | "dichiarazione";

export async function accettaDocumento(
  tipo: TipoDoc,
  versione: number,
  dettaglio: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("accetta_documento", {
    p_tipo: tipo,
    p_versione: versione,
    p_dettaglio: dettaglio,
  });
  if (error) throw new Error(`Registrazione consenso fallita: ${error.message}`);
}

// --- Testo di un documento (per le pagine informative) ----------------------
const testoSchema = z.object({
  tipo: z.enum(["termini", "privacy", "cookie", "dichiarazione"]),
  versione: z.number().int(),
  titolo: z.string(),
  corpo: z.string(),
});
export type TestoLegale = z.infer<typeof testoSchema>;

export async function leggiTesto(tipo: TipoDoc): Promise<TestoLegale | null> {
  const { data, error } = await getSupabaseClient()
    .from("legal_texts")
    .select("tipo, versione, titolo, corpo")
    .eq("tipo", tipo)
    .eq("attivo", true)
    .maybeSingle();
  if (error || !data) return null;
  return testoSchema.parse(data);
}

// --- Segnalazioni ------------------------------------------------------------
export type MotivoSegnalazione =
  | "falso_ingannevole"
  | "senza_permesso"
  | "offensivo"
  | "altro";

export async function segnalaContenuto(
  contributionId: string,
  motivo: MotivoSegnalazione,
  nota?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("segnala_contenuto", {
    p_contribution_id: contributionId,
    p_motivo: motivo,
    p_nota: nota ?? null,
  });
  if (error) throw new Error(`Segnalazione fallita: ${error.message}`);
}
