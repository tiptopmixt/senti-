/**
 * ipotesi — l'assistente IA commenta un ritrovamento (foto + testo).
 *
 * Chiamata UNA VOLTA SOLA, alla pubblicazione, dal client (fire-and-forget).
 * Legge il contributo, scarica la foto (se c'è) dallo Storage con la
 * service_role e chiede a Claude una breve ipotesi al condizionale su cosa
 * POTREBBE essere. Salva il risultato nel riquadro separato "Ipotesi
 * dell'assistente" (contribution_context, tipo='ipotesi_assistente').
 *
 * REGOLE (nel prompt di anthropic.ts):
 * - sempre al condizionale, 2-4 frasi, italiano semplice;
 * - non giudica se la memoria è vera o falsa;
 * - se non identificabile lo dice;
 * - se sospetto residuato bellico → nessuna istruzione per maneggiarlo, e il
 *   server aggiunge SEMPRE l'avviso prioritario "chiama il 112".
 *
 * Non è mai bloccante: se qualcosa fallisce, la memoria resta pubblicata lo
 * stesso, senza riquadro. Idempotente: se l'ipotesi esiste già, non richiama
 * Claude.
 *
 * Richiesta: POST { "contribution_id": "<uuid>" }
 */
import { preflight, json, fail } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { ipotesiAssistente, type FotoInput } from "../_shared/anthropic.ts";

const BUCKET = "foto";

// Avviso di sicurezza: testo FISSO, deciso dal server (mai dal modello), così è
// identico ovunque. Nessuna istruzione per maneggiare l'ordigno.
const AVVISO_RESIDUATO =
  "⚠️ Se pensi possa essere un residuato bellico o un ordigno, non toccarlo e non spostarlo: chiama subito il 112.";

/** Tipo MIME dell'immagine dedotto dall'estensione (HEIC non è gestito da Claude). */
function mimeDaPercorso(percorso: string): FotoInput["mimeType"] | null {
  const p = percorso.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function inBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Usare POST", 405);

  let body: { contribution_id?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Corpo della richiesta non è JSON valido");
  }
  if (!body.contribution_id) return fail("contribution_id mancante");

  const db = adminClient();

  // Idempotenza: l'analisi è UNA sola per memoria. Se c'è già, la si restituisce
  // senza richiamare Claude.
  const { data: esistente } = await db
    .from("contribution_context")
    .select("titolo, corpo, avviso")
    .eq("contribution_id", body.contribution_id)
    .eq("tipo", "ipotesi_assistente")
    .maybeSingle();
  if (esistente) {
    return json({ contribution_id: body.contribution_id, ipotesi: esistente, gia_presente: true });
  }

  const { data: c, error } = await db
    .from("contributions")
    .select("id, body, media_path")
    .eq("id", body.contribution_id)
    .maybeSingle();
  if (error) return fail("Lettura del contributo fallita", 500, error.message);
  if (!c) return fail("Contributo non trovato", 404);

  // Foto (se presente e in un formato che Claude gestisce).
  let foto: FotoInput | undefined;
  const mime = c.media_path ? mimeDaPercorso(c.media_path) : null;
  if (c.media_path && mime) {
    const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(c.media_path);
    if (!dlErr && file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      foto = { base64: inBase64(bytes), mimeType: mime };
    }
  }

  const testo = (c.body ?? "").trim();
  if (!testo && !foto) {
    return json({ contribution_id: body.contribution_id, ipotesi: null, messaggio: "Niente foto né testo." });
  }

  // Se Claude fallisce o rifiuta, NON blocchiamo: la memoria resta pubblicata.
  let esito;
  try {
    esito = await ipotesiAssistente({ testo, foto });
  } catch (e) {
    return json({ contribution_id: body.contribution_id, ipotesi: null, errore: String(e) });
  }
  if (!esito) {
    return json({ contribution_id: body.contribution_id, ipotesi: null });
  }

  const avviso = esito.residuato ? AVVISO_RESIDUATO : null;

  const { data: salvato, error: upErr } = await db
    .from("contribution_context")
    .upsert(
      {
        contribution_id: body.contribution_id,
        tipo: "ipotesi_assistente",
        titolo: "Ipotesi dell'assistente",
        corpo: esito.commento,
        avviso,
      },
      { onConflict: "contribution_id,tipo" },
    )
    .select("titolo, corpo, avviso")
    .single();
  if (upErr) return fail("Salvataggio dell'ipotesi fallito", 500, upErr.message);

  return json({ contribution_id: body.contribution_id, ipotesi: salvato });
});
