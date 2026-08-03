import { getSupabaseClient } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/auth";
import {
  nuovoRitrovamentoSchema,
  publicContributionSchema,
  type NuovoRitrovamento,
  type PublicContribution,
} from "@/lib/validation";

const BUCKET = "foto";

/** Estensione coerente col MIME, così lo Storage accetta il file. */
function estensionePer(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic")) return "heic";
  return "jpg";
}

/**
 * Carica una foto nello Storage e restituisce il percorso salvato.
 * Il percorso è `<uid>/<id>.<ext>`: la policy consente la scrittura solo dentro
 * la cartella del proprio utente.
 */
export async function caricaFoto(
  id: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const session = await ensureSession();
  const percorso = `${session.user.id}/${id}.${estensionePer(mimeType)}`;

  const { error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .upload(percorso, blob, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Caricamento della foto fallito: ${error.message}`);
  return percorso;
}

/** URL firmato e temporaneo per mostrare la foto di un ritrovamento. */
export async function urlFotoFirmato(mediaPath: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .createSignedUrl(mediaPath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Pubblica un ritrovamento E salva la dichiarazione di responsabilità, in
 * un'unica transazione lato server (RPC pubblica_ritrovamento): crea il pin (con
 * la categoria/icona scelta), il contenuto foto/testo e la prova.
 *
 * Il server rifiuta: contenuto altrui senza permesso; senza veridicità.
 */
export async function pubblicaRitrovamento(
  input: NuovoRitrovamento,
): Promise<{ id: string }> {
  const dati = nuovoRitrovamentoSchema.parse(input);
  const { data, error } = await getSupabaseClient().rpc("pubblica_ritrovamento", {
    p_finding_type: dati.findingType,
    p_name: dati.name,
    p_lon: dati.lon,
    p_lat: dati.lat,
    p_zone_radius_m: dati.zoneRadiusM,
    p_kind: dati.kind,
    p_body: dati.body,
    p_media_path: dati.mediaPath,
    p_poi_id: dati.poiId,
    p_route_id: dati.routeId,
    p_event_year: dati.eventYear,
    p_hazard_flag: dati.hazardFlag,
    p_is_anonymous: dati.isAnonymous,
    p_voce_propria: dati.vocePropria,
    p_permesso_terzi: dati.permessoTerzi,
    p_veridicita: dati.veridicita,
    p_client_key: dati.clientKey ?? null,
  });
  if (error) throw new Error(`Pubblicazione fallita: ${error.message}`);
  return { id: String(data) };
}

/**
 * Contenuti pubblici di un luogo. Passa SOLO dalla vista `v_contributions_public`:
 * è il meccanismo che garantisce che `author_id` non esca mai.
 */
export async function contenutiPubbliciPerLuogo(
  poiId: string,
): Promise<PublicContribution[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_contributions_public")
    .select("*")
    .eq("poi_id", poiId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Lettura dei contenuti fallita: ${error.message}`);
  return publicContributionSchema.array().parse(data ?? []);
}
