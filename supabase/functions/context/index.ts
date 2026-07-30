/**
 * context — contesto storico automatico (aggiunta della piattaforma, separata).
 *
 * Data una memoria che cita un fatto storico pubblico e databile, cerca una
 * fonte affidabile e salva un riquadro "Contesto storico" separato dal racconto.
 *
 * REGOLE FERREE (nel prompt di anthropic.ts):
 * - non dichiara mai se il racconto è vero o falso;
 * - non commenta la testimonianza;
 * - se non trova una fonte affidabile, non scrive nulla.
 *
 * Richiesta: POST { "contribution_id": "<uuid>" }
 */
import { preflight, json, fail } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { contestoStorico } from "../_shared/anthropic.ts";

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

  const { data: c, error } = await db
    .from("contributions")
    .select("id, body, transcript")
    .eq("id", body.contribution_id)
    .maybeSingle();
  if (error) return fail("Lettura del contributo fallita", 500, error.message);
  if (!c) return fail("Contributo non trovato", 404);

  const testo = (c.transcript ?? c.body ?? "").trim();
  if (!testo) {
    return json({ contribution_id: body.contribution_id, contesto: null, messaggio: "Nessun testo su cui lavorare." });
  }

  let contesto;
  try {
    contesto = await contestoStorico(testo);
  } catch (e) {
    return fail("Generazione del contesto fallita", 502, String(e));
  }

  // Regola ferrea: se non c'è un fatto storico con fonte affidabile, non si
  // scrive nulla.
  if (!contesto) {
    return json({ contribution_id: body.contribution_id, contesto: null });
  }

  const { data: salvato, error: upErr } = await db
    .from("contribution_context")
    .upsert(
      {
        contribution_id: body.contribution_id,
        tipo: "contesto_storico",
        corpo: contesto.corpo,
        fonte_nome: contesto.fonte_nome,
        fonte_url: contesto.fonte_url,
      },
      { onConflict: "contribution_id,tipo" },
    )
    .select("titolo, corpo, fonte_nome, fonte_url")
    .single();
  if (upErr) return fail("Salvataggio del contesto fallito", 500, upErr.message);

  return json({ contribution_id: body.contribution_id, contesto: salvato });
});
