/**
 * curate — aiuto alla curatrice.
 *
 * Dato un POI, guarda le memorie in attesa e quelle già approvate dello stesso
 * luogo e propone: un riassunto asciutto, possibili duplicati, date discordanti,
 * collegamenti da valutare.
 *
 * REGOLA FERREA: l'IA SUGGERISCE, non decide. Non approva, non rifiuta, non
 * modifica nulla. La moderazione resta un atto umano. Questa funzione produce
 * solo testo di supporto.
 *
 * Richiesta: POST { "poi_id": "<uuid>" }
 */
import { preflight, json, fail } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { synthesize } from "../_shared/anthropic.ts";

const SYSTEM_PROMPT = `Sei l'assistente di una curatrice che modera memorie di comunità. Il tuo compito è SUPPORTARE la sua decisione, mai prenderla al posto suo.

Ti vengono date memorie di uno stesso luogo: alcune in attesa di moderazione, altre già approvate. Rispondi in italiano, in modo asciutto e concreto, con queste sezioni (ometti quelle senza contenuto):

**In sintesi** — una frase per ogni memoria in attesa: chi parla e di cosa.

**Possibili duplicati** — se una memoria in attesa racconta lo stesso episodio di un'altra (in attesa o già approvata), segnalalo indicando quali e perché. Non affermare con certezza: usa "sembra", "potrebbe".

**Date discordanti** — se due memorie datano lo stesso fatto in modo diverso, segnalalo riportando entrambe le date. NON dire quale sia giusta.

**Da valutare** — eventuali dubbi che meritano l'attenzione umana (consenso incerto, contenuto fuori tema, ecc.).

Regole:
- Non inventare nulla che non sia nei testi.
- Non consigliare "approva" o "rifiuta": non è compito tuo.
- Se non c'è niente da segnalare in una sezione, ometti la sezione.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Usare POST", 405);

  let body: { poi_id?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Corpo della richiesta non è JSON valido");
  }
  if (!body.poi_id) return fail("poi_id mancante");

  const db = adminClient();

  const { data: poi } = await db
    .from("pois")
    .select("id, name")
    .eq("id", body.poi_id)
    .maybeSingle();
  if (!poi) return fail("Luogo non trovato", 404);

  // Legge tutte le memorie del luogo (service role): in attesa e approvate.
  const { data: memorie, error } = await db
    .from("contributions")
    .select("id, status, body, transcript, narrator_name, narrator_birth_year, event_year, created_at")
    .eq("poi_id", body.poi_id)
    .in("status", ["in_attesa", "approvato"])
    .order("created_at", { ascending: true });
  if (error) return fail("Lettura delle memorie fallita", 500, error.message);

  const inAttesa = (memorie ?? []).filter((m) => m.status === "in_attesa");
  if (inAttesa.length === 0) {
    return json({ poi_id: body.poi_id, suggerimenti: null, messaggio: "Nessuna memoria in attesa per questo luogo." });
  }

  const elenco = (memorie ?? [])
    .map((m, i) => {
      const testo = (m.body ?? m.transcript ?? "").trim();
      const stato = m.status === "in_attesa" ? "IN ATTESA" : "già approvata";
      const anno = m.event_year ? ` [evento: ${m.event_year}]` : "";
      return `Memoria ${i + 1} (${stato})${anno} — testimone: ${m.narrator_name ?? "n/d"}\n"${testo}"`;
    })
    .join("\n\n");

  const userPrompt = `Luogo: ${poi.name}\n\n${elenco}`;

  let suggerimenti: string;
  try {
    suggerimenti = await synthesize(SYSTEM_PROMPT, userPrompt);
  } catch (e) {
    return fail("Generazione dei suggerimenti fallita", 502, String(e));
  }

  return json({ poi_id: body.poi_id, in_attesa: inAttesa.length, suggerimenti });
});
