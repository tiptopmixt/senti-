import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";
import { contributionKindSchema, contributionStatusSchema, findingTypeSchema } from "@/lib/validation";

/**
 * La coda dei contenuti segnalati. Passa dalle RPC che verificano il ruolo
 * moderatore e non espongono mai author_id: si modera il contenuto, non
 * l'identità. I ritrovamenti sono pubblici subito; qui si interviene a posteriori.
 */
const contenutoSegnalatoSchema = z.object({
  id: z.guid(),
  poi_id: z.guid().nullable(),
  poi_nome: z.string().nullable(),
  finding_type: findingTypeSchema.nullable(),
  kind: contributionKindSchema,
  body: z.string().nullable(),
  media_path: z.string().nullable(),
  status: contributionStatusSchema,
  event_year: z.number().int().nullable(),
  segnalazioni: z.number().int(),
  motivi_segnalazioni: z.string().nullable(),
  created_at: z.string(),
});
export type ContenutoSegnalato = z.infer<typeof contenutoSegnalatoSchema>;

export async function contenutiSegnalati(): Promise<ContenutoSegnalato[]> {
  const { data, error } = await getSupabaseClient().rpc("contenuti_segnalati");
  if (error) throw new Error(`Lettura della coda fallita: ${error.message}`);
  return contenutoSegnalatoSchema.array().parse(data ?? []);
}

/** Rimuove (true) o ripristina (false) un contenuto segnalato. */
export async function moderaContenuto(id: string, rimuovi: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc("modera_contenuto", {
    p_id: id,
    p_rimuovi: rimuovi,
  });
  if (error) throw new Error(`Moderazione fallita: ${error.message}`);
}
