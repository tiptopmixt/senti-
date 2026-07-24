/**
 * transcribe — trascrive un contributo audio con Whisper e ne calcola l'embedding.
 *
 * INVARIANTE NON NEGOZIABILE: se `narrator_consent` non è true, Whisper NON
 * parte. Il controllo avviene qui, PRIMA di qualunque chiamata a OpenAI, e il
 * vincolo CHECK sul database fa da seconda rete di sicurezza.
 *
 * Richiesta:  POST { "contribution_id": "<uuid>", "force"?: boolean }
 * Risposta:   { "transcript": "...", "cached": false }
 */
import { preflight, json, fail, corsHeaders } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { transcribeAudio, embed } from "../_shared/openai.ts";

const BUCKET = Deno.env.get("SENTI_AUDIO_BUCKET") ?? "audio";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return fail("Usare POST", 405);
  }

  let body: { contribution_id?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail("Corpo della richiesta non è JSON valido");
  }

  const id = body.contribution_id;
  if (!id) return fail("contribution_id mancante");

  const db = adminClient();

  // 1. Carica il contributo.
  const { data: contrib, error: readErr } = await db
    .from("contributions")
    .select("id, poi_id, kind, media_path, transcript, narrator_consent")
    .eq("id", id)
    .maybeSingle();

  if (readErr) return fail("Errore di lettura del contributo", 500, readErr.message);
  if (!contrib) return fail("Contributo non trovato", 404);

  // 2. IL CANCELLO: senza consenso del narratore non si trascrive.
  if (contrib.narrator_consent !== true) {
    return fail(
      "Consenso del narratore assente: la trascrizione non può essere avviata.",
      403,
    );
  }

  if (contrib.kind !== "audio") {
    return fail(`Il contributo non è audio (kind=${contrib.kind})`, 422);
  }
  if (!contrib.media_path) {
    return fail("Il contributo non ha un file audio associato", 422);
  }

  // 3. Idempotenza: se c'è già una trascrizione non si rifà, salvo force.
  if (contrib.transcript && !body.force) {
    return json({ transcript: contrib.transcript, cached: true });
  }

  // 4. Scarica l'audio dallo Storage.
  const { data: file, error: dlErr } = await db.storage
    .from(BUCKET)
    .download(contrib.media_path);
  if (dlErr || !file) {
    return fail("Impossibile scaricare l'audio", 502, dlErr?.message);
  }

  // 5. Glossario dei toponimi dell'area del POI (migliora i nomi di luogo).
  let hints: string[] = [];
  if (contrib.poi_id) {
    const { data: poi } = await db
      .from("v_pois_public")
      .select("lat, lon")
      .eq("id", contrib.poi_id)
      .maybeSingle();
    if (poi?.lat != null && poi?.lon != null) {
      const { data: terms } = await db.rpc("toponyms_for_point", {
        p_geog: `SRID=4326;POINT(${poi.lon} ${poi.lat})`,
        p_lang: "it",
      });
      if (Array.isArray(terms)) hints = terms as string[];
    }
  }

  // 6. Whisper.
  let transcript: string;
  try {
    const filename = contrib.media_path.split("/").pop() ?? "audio.webm";
    transcript = await transcribeAudio(file, filename, hints, "it");
  } catch (e) {
    return fail("Trascrizione fallita", 502, String(e));
  }
  if (!transcript) {
    return fail("Whisper ha restituito una trascrizione vuota", 502);
  }

  // 7. Embedding del testo trascritto.
  let embedding: number[] | null = null;
  try {
    embedding = await embed(transcript);
  } catch (e) {
    // L'embedding è utile ma non essenziale: si salva comunque la trascrizione.
    console.error("Embedding fallito, procedo senza:", String(e));
  }

  // 8. Salva. Il vincolo CHECK sul DB rifiuterebbe la scrittura senza consenso.
  const { error: upErr } = await db
    .from("contributions")
    .update({ transcript, ...(embedding ? { embedding } : {}) })
    .eq("id", id);
  if (upErr) return fail("Salvataggio della trascrizione fallito", 500, upErr.message);

  // 9. Telemetria minima.
  await db.from("events").insert({
    name: "transcribe_ok",
    props: { contribution_id: id, toponimi: hints.length, caratteri: transcript.length },
  });

  return new Response(
    JSON.stringify({ transcript, cached: false, toponimi_usati: hints.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
