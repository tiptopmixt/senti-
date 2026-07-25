import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * La coda di moderazione. Passa dalle RPC che verificano il ruolo curatrice e
 * non espongono mai author_id: si modera il contenuto, non l'identità.
 */
const memoriaModerazioneSchema = z.object({
  id: z.guid(),
  poi_id: z.guid().nullable(),
  poi_nome: z.string().nullable(),
  kind: z.enum(["foto", "audio", "testo"]),
  body: z.string().nullable(),
  transcript: z.string().nullable(),
  media_path: z.string().nullable(),
  narrator_name: z.string().nullable(),
  narrator_birth_year: z.number().int().nullable(),
  event_year: z.number().int().nullable(),
  text_source: z.enum(["raccoglitore", "automatica", "nessuno"]),
  narrator_consent: z.boolean(),
  voce_propria: z.boolean().nullable(),
  permesso_terzi: z.boolean().nullable(),
  segnalazioni: z.number().int(),
  motivi_segnalazioni: z.string().nullable(),
  created_at: z.string(),
});
export type MemoriaModerazione = z.infer<typeof memoriaModerazioneSchema>;

export async function memorieDaModerare(): Promise<MemoriaModerazione[]> {
  const { data, error } = await getSupabaseClient().rpc("memorie_da_moderare");
  if (error) throw new Error(`Lettura della coda fallita: ${error.message}`);
  return memoriaModerazioneSchema.array().parse(data ?? []);
}

export async function moderaMemoria(
  id: string,
  approva: boolean,
  motivo?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("modera_memoria", {
    p_id: id,
    p_approva: approva,
    p_motivo: motivo ?? null,
  });
  if (error) throw new Error(`Moderazione fallita: ${error.message}`);
}
