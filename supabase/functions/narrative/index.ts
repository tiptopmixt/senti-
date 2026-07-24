/**
 * narrative — compone la narrazione unificata di un luogo a partire dalle memorie.
 *
 * REGOLE EDITORIALI NON NEGOZIABILI:
 * - Usa SOLO ciò che dicono i testimoni: nessun contesto storico aggiunto.
 * - Citazione obbligatoria della fonte per ogni affermazione.
 * - I conflitti NON si appianano: se due testimoni discordano, si dice.
 * - I due livelli non si fondono: qui entrano solo le MEMORIE, mai il materiale
 *   editoriale delle campagne.
 *
 * Cache: se le fonti non sono cambiate (fingerprint uguale) si restituisce la
 * versione già salvata, senza richiamare il modello.
 *
 * Richiesta: POST { "poi_id": "<uuid>", "lang"?: "it", "force"?: boolean }
 */
import { preflight, json, fail } from "../_shared/cors.ts";
import { adminClient, sha256 } from "../_shared/supabase.ts";
import { synthesize } from "../_shared/anthropic.ts";

const SYSTEM_PROMPT = `Sei un archivista che compone una narrazione unificata basandosi ESCLUSIVAMENTE sulle testimonianze che ti vengono fornite.

Regole assolute:
1. Usa SOLO ciò che dicono i testimoni. Non aggiungere contesto storico, date, nomi, luoghi, cause o conseguenze che non siano già nel testo delle testimonianze.
2. Se un'informazione manca, non colmare il vuoto: tacila. Meglio una narrazione breve che una inventata.
3. Cita SEMPRE la fonte di ogni affermazione, indicando il testimone tra parentesi quadre, così: [Bruno Marchetti].
4. NON appianare i conflitti. Se due testimoni si contraddicono (per esempio date diverse), riporta ENTRAMBE le versioni e dichiara esplicitamente che sono discordanti. Non scegliere una versione, non mediare, non scrivere "circa" per nascondere la differenza.
5. Non inventare collegamenti tra testimonianze diverse se non sono espliciti nei testi.
6. Scrivi in italiano, in prosa sobria e asciutta. Nessuna enfasi retorica, nessuna celebrazione.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Usare POST", 405);

  let body: { poi_id?: string; lang?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail("Corpo della richiesta non è JSON valido");
  }

  const poiId = body.poi_id;
  const lang = body.lang ?? "it";
  if (!poiId) return fail("poi_id mancante");

  const db = adminClient();

  // 1. Il luogo (dalla vista pubblica: nessun author_id).
  const { data: poi, error: poiErr } = await db
    .from("v_pois_public")
    .select("id, name, description")
    .eq("id", poiId)
    .maybeSingle();
  if (poiErr) return fail("Errore di lettura del luogo", 500, poiErr.message);
  if (!poi) return fail("Luogo non trovato", 404);

  // 2. Le memorie pubblicabili (approvate e con consenso del narratore).
  const { data: memories, error: memErr } = await db
    .from("v_contributions_public")
    .select("id, kind, body, transcript, narrator_name, narrator_birth_year, created_at")
    .eq("poi_id", poiId)
    .order("created_at", { ascending: true });
  if (memErr) return fail("Errore di lettura delle memorie", 500, memErr.message);

  const usable = (memories ?? []).filter((m) =>
    (m.body ?? m.transcript ?? "").trim().length > 0
  );

  if (usable.length === 0) {
    return json({
      poi_id: poiId,
      body: null,
      messaggio: "Nessuna memoria disponibile per questo luogo.",
    });
  }

  // 3. Conflitti già dichiarati dai curatori tra queste memorie.
  const ids = usable.map((m) => m.id);
  const { data: links } = await db
    .from("contribution_links")
    .select("from_contribution, to_contribution, kind, note")
    .in("from_contribution", ids);

  const declaredConflicts = (links ?? []).filter((l) => l.kind === "conflitto");
  const sameEpisode = (links ?? []).filter((l) => l.kind === "stesso_episodio");

  // 4. Fingerprint delle fonti: se non cambiano, non si richiama il modello.
  const fingerprintInput = JSON.stringify({
    lang,
    memories: usable.map((m) => ({
      id: m.id,
      t: (m.body ?? m.transcript ?? "").trim(),
      n: m.narrator_name,
    })),
    links: (links ?? []).map((l) => [l.from_contribution, l.to_contribution, l.kind]),
  });
  const fingerprint = await sha256(fingerprintInput);

  const { data: cached } = await db
    .from("poi_narratives")
    .select("id, version, body, sources, created_at")
    .eq("poi_id", poiId)
    .eq("lang", lang)
    .eq("fingerprint", fingerprint)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && !body.force) {
    return json({ ...cached, poi_id: poiId, lang, cached: true });
  }

  // 5. Composizione del messaggio per il modello.
  const testimonianze = usable
    .map((m, i) => {
      const eta = m.narrator_birth_year ? ` (nato nel ${m.narrator_birth_year})` : "";
      const testo = (m.body ?? m.transcript ?? "").trim();
      return `Testimonianza ${i + 1} — testimone: ${m.narrator_name ?? "non indicato"}${eta}\n"${testo}"`;
    })
    .join("\n\n");

  const notaConflitti = declaredConflicts.length > 0
    ? `\n\nATTENZIONE: i curatori hanno già segnalato ${declaredConflicts.length} conflitto/i fra queste testimonianze:\n` +
      declaredConflicts.map((c) => `- ${c.note ?? "versioni discordanti"}`).join("\n") +
      "\nDevi riportare entrambe le versioni e dichiarare esplicitamente la discordanza."
    : "";

  const notaStessoEpisodio = sameEpisode.length > 0
    ? `\n\nNota: ${sameEpisode.length} coppia/e di testimonianze riguardano lo stesso episodio: unificale senza ripetere due volte gli stessi fatti, ma cita entrambi i testimoni.`
    : "";

  const userPrompt =
    `Luogo: ${poi.name}\n\nComponi la narrazione unificata di questo luogo usando solo le testimonianze seguenti.\n\n${testimonianze}${notaConflitti}${notaStessoEpisodio}`;

  // 6. Chiamata al modello.
  let narrativeBody: string;
  try {
    narrativeBody = await synthesize(SYSTEM_PROMPT, userPrompt);
  } catch (e) {
    return fail("Generazione della narrazione fallita", 502, String(e));
  }
  if (!narrativeBody) return fail("Il modello ha restituito un testo vuoto", 502);

  // 7. Nuova versione. Le fonti sono le testimonianze usate (mai author_id).
  const { data: last } = await db
    .from("poi_narratives")
    .select("version")
    .eq("poi_id", poiId)
    .eq("lang", lang)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (last?.version ?? 0) + 1;

  const sources = usable.map((m) => ({
    contribution_id: m.id,
    testimone: m.narrator_name,
    anno_nascita: m.narrator_birth_year,
  }));

  const { data: inserted, error: insErr } = await db
    .from("poi_narratives")
    .insert({
      poi_id: poiId,
      lang,
      version: nextVersion,
      body: narrativeBody,
      sources,
      fingerprint,
    })
    .select("id, version, body, sources, created_at")
    .single();
  if (insErr) return fail("Salvataggio della narrazione fallito", 500, insErr.message);

  await db.from("events").insert({
    name: "narrative_generated",
    props: {
      poi_id: poiId,
      lang,
      version: nextVersion,
      testimonianze: usable.length,
      conflitti: declaredConflicts.length,
    },
  });

  return json({ ...inserted, poi_id: poiId, lang, cached: false });
});
