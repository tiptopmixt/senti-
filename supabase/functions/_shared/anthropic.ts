import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";

/**
 * Client Anthropic per la narrazione unificata.
 *
 * La chiave vive SOLO come secret della Edge Function (ANTHROPIC_API_KEY),
 * mai nel bundle client.
 *
 * NOTA: Anthropic non offre API di trascrizione audio né di embedding —
 * quelle restano a carico di un altro fornitore (vedi transcribe).
 */
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-4-8";

function client(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY mancante nei secret della Edge Function");
  }
  return new Anthropic({ apiKey });
}

/**
 * Sintesi testuale con Claude.
 *
 * Usa il "thinking adattivo": il modello decide da sé quanto ragionare, cosa
 * utile qui perché deve tenere insieme regole rigide (citare le fonti, non
 * appianare i conflitti, non aggiungere nulla di suo).
 *
 * Attenzione: su Opus 4.8 i parametri di campionamento (temperature, top_p,
 * top_k) NON sono accettati e farebbero fallire la richiesta con un 400.
 */
export async function synthesize(system: string, user: string): Promise<string> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Il modello ha rifiutato di generare la narrazione");
  }

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
