import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * "Cosa è successo qui": la colonna del tempo di un luogo.
 *
 * Un unico elenco cronologico che mescola gli eventi delle campagne (storia con
 * fonti) e le memorie delle persone. I due livelli restano distinti nella resa
 * — non si fondono mai — ma condividono la stessa linea del tempo.
 */
const voceSchema = z.object({
  tipo: z.enum(["campagna", "memoria"]),
  id: z.guid(),
  titolo: z.string().nullable(),
  sottotitolo: z.string().nullable(),
  anno: z.number().int().nullable(),
  certezza: z.enum(["attestato", "probabile", "ipotetico"]).nullable(),
  testo: z.string().nullable(),
  media_path: z.string().nullable(),
  text_source: z.enum(["raccoglitore", "automatica", "nessuno"]).nullable(),
  distanza_m: z.number(),
  chainage_m: z.number().nullable(),
});
export type VoceTempo = z.infer<typeof voceSchema>;

export async function cosaESuccessoQui(
  lon: number,
  lat: number,
  raggioBase = 500,
): Promise<VoceTempo[]> {
  const { data, error } = await getSupabaseClient().rpc("cosa_e_successo_qui", {
    p_lon: lon,
    p_lat: lat,
    p_raggio_base: raggioBase,
  });
  if (error) throw new Error(`Lettura della colonna del tempo fallita: ${error.message}`);
  const voci = voceSchema.array().parse(data ?? []);

  // Ordinamento cronologico garantito lato client: prima ciò che ha un anno,
  // dal più antico; le voci senza data in fondo, per vicinanza. Non ci si
  // affida all'ordine del trasporto REST.
  return voci.sort((a, b) => {
    if (a.anno !== null && b.anno !== null) return a.anno - b.anno;
    if (a.anno === null && b.anno === null) return a.distanza_m - b.distanza_m;
    return a.anno === null ? 1 : -1;
  });
}
