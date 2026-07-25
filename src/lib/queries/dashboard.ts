import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * La dashboard personale: il registro reso visibile al titolare.
 *
 * Passa dall'RPC my_dashboard, che restituisce SOLO aggregati — mai l'identità
 * di chi ha votato o visitato. In cima ciò che conta di più (citazioni, luoghi
 * di cui sei l'unica voce), poi i punti, in fondo i conteggi.
 */
const luogoVicinoSchema = z.object({
  id: z.number(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
});

const dashboardSchema = z.object({
  anonimo: z.boolean(),
  citazioni: z.number().int().optional(),
  luoghi_unica_voce: z.number().int().optional(),
  punti: z.number().int().optional(),
  quota_percento: z.number().optional(),
  pois: z.number().int().optional(),
  contributi: z.number().int().optional(),
  reazioni: z.number().int().optional(),
  visite: z.number().int().optional(),
  luogo_da_raccontare_vicino: luogoVicinoSchema.nullable().optional(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export async function myDashboard(
  lon?: number,
  lat?: number,
): Promise<Dashboard> {
  const { data, error } = await getSupabaseClient().rpc("my_dashboard", {
    p_lon: lon ?? null,
    p_lat: lat ?? null,
  });
  if (error) throw new Error(`Lettura della dashboard fallita: ${error.message}`);
  return dashboardSchema.parse(data);
}

/** Registra una visita a un luogo (dedup giornaliera lato server, nessun IP). */
export async function registraVisita(poiId: string): Promise<void> {
  // Fire-and-forget: una visita non registrata non è un problema per l'utente.
  await getSupabaseClient()
    .rpc("registra_visita", { p_poi_id: poiId })
    .then(() => {}, () => {});
}
