import { getSupabaseClient } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/auth";
import {
  audioContributionInputSchema,
  publicContributionSchema,
  type AudioContributionInput,
  type PublicContribution,
} from "@/lib/validation";

const BUCKET = "audio";

/** Estensione coerente col MIME, così lo Storage accetta il file. */
function estensionePer(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

/**
 * Carica l'audio nello Storage e restituisce il percorso salvato.
 *
 * Il percorso è `<uid>/<id>.<ext>`: la policy dello Storage consente la
 * scrittura solo dentro la cartella del proprio utente.
 */
export async function caricaAudio(
  id: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const session = await ensureSession();
  const percorso = `${session.user.id}/${id}.${estensionePer(mimeType)}`;

  const { error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .upload(percorso, blob, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Caricamento audio fallito: ${error.message}`);
  return percorso;
}

/**
 * Crea la memoria audio nel database.
 *
 * INVARIANTE: senza consenso del narratore il contributo resta comunque
 * privato — la vista pubblica filtra `narrator_consent = true` e il DB
 * impedisce qualunque trascrizione.
 *
 * `text_source` non viene inviata: la deriva un trigger dal contenuto, così
 * l'origine del testo non può essere dichiarata falsamente.
 */
export async function creaMemoriaAudio(
  input: AudioContributionInput,
): Promise<{ id: string }> {
  const dati = audioContributionInputSchema.parse(input);
  const session = await ensureSession();

  const { data, error } = await getSupabaseClient()
    .from("contributions")
    .insert({
      author_id: session.user.id,
      collected_by: session.user.id,
      poi_id: dati.poiId,
      kind: "audio",
      media_path: dati.mediaPath,
      audio_duration_ms: dati.audioDurationMs,
      body: dati.note,
      narrator_name: dati.narratorName,
      narrator_birth_year: dati.narratorBirthYear,
      narrator_consent: dati.narratorConsent,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Salvataggio della memoria fallito: ${error.message}`);
  return { id: String(data.id) };
}

/**
 * URL firmato e temporaneo per riascoltare l'audio di una memoria.
 *
 * Il bucket è privato: si passa da un URL firmato, non da un link pubblico. La
 * policy dello Storage concede comunque la lettura solo agli audio di memorie
 * approvate e con consenso, quindi un percorso "rubato" non produce nulla.
 */
export async function urlAudioFirmato(mediaPath: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .createSignedUrl(mediaPath, 3600); // un'ora
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Pubblica una memoria audio E salva la dichiarazione, in un'unica transazione
 * lato server (RPC pubblica_memoria). La dichiarazione è la prova specifica per
 * quel contenuto: viene registrata davvero, non solo mostrata.
 *
 * Il server rifiuta: storia altrui senza permesso; audio senza consenso alla
 * voce; senza dichiarazione di veridicità.
 */
export async function pubblicaMemoriaAudio(input: {
  mediaPath: string;
  audioDurationMs: number | null;
  poiId: string | null;
  note: string | null;
  narratorName: string | null;
  narratorBirthYear: number | null;
  eventYear: number | null;
  narratorConsent: boolean;
  isAnonymous: boolean;
  vocePropria: boolean;
  permessoTerzi: boolean;
  veridicita: boolean;
}): Promise<{ id: string }> {
  const { data, error } = await getSupabaseClient().rpc("pubblica_memoria", {
    p_kind: "audio",
    p_poi_id: input.poiId,
    p_media_path: input.mediaPath,
    p_audio_duration_ms: input.audioDurationMs,
    p_body: input.note,
    p_narrator_name: input.narratorName,
    p_narrator_birth_year: input.narratorBirthYear,
    p_event_year: input.eventYear,
    p_narrator_consent: input.narratorConsent,
    p_is_anonymous: input.isAnonymous,
    p_voce_propria: input.vocePropria,
    p_permesso_terzi: input.permessoTerzi,
    p_veridicita: input.veridicita,
  });
  if (error) throw new Error(`Pubblicazione fallita: ${error.message}`);
  return { id: String(data) };
}

/**
 * Memorie pubbliche di un luogo. Passa SOLO dalla vista `v_contributions_public`:
 * è il meccanismo che garantisce che `author_id` non esca mai.
 */
export async function memoriePubblichePerLuogo(
  poiId: string,
): Promise<PublicContribution[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_contributions_public")
    .select("*")
    .eq("poi_id", poiId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Lettura delle memorie fallita: ${error.message}`);
  return publicContributionSchema.array().parse(data ?? []);
}
