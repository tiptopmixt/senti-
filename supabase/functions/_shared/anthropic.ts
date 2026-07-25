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

/**
 * Contesto storico di un fatto pubblico citato in una testimonianza.
 *
 * Usa la ricerca web per trovare una FONTE VERA (niente link inventati). Regole
 * ferree nel prompt: non dice mai se il racconto è vero o falso, non commenta la
 * testimonianza, e se non trova una fonte affidabile restituisce null.
 */
export async function contestoStorico(testo: string): Promise<{
  corpo: string;
  fonte_nome: string | null;
  fonte_url: string | null;
} | null> {
  const system = `Sei un assistente che aggiunge CONTESTO STORICO accanto a una testimonianza personale, come nota separata della piattaforma. Non fai parte della testimonianza.

Regole assolute:
- NON dichiarare mai se il racconto è vero o falso. NON commentare, valutare o mettere in dubbio la testimonianza.
- Interviene SOLO se la testimonianza cita un fatto storico pubblico e databile (una battaglia, un evento noto, una data precisa, un luogo storico).
- Cerca sul web una fonte affidabile (enciclopedia, archivio, istituzione) e cita SOLO informazioni che trovi nella fonte. NON inventare date, nomi o link.
- Se NON trovi un fatto storico pubblico, o NON trovi una fonte affidabile, non scrivere nulla.

Rispondi SOLO con un oggetto JSON, senza altro testo:
{"trovato": true|false, "corpo": "2-4 frasi di contesto storico neutro", "fonte_nome": "nome della fonte", "fonte_url": "URL della fonte"}
Se trovato è false, gli altri campi possono essere vuoti.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content: `Testimonianza:\n"${testo}"\n\nC'è un fatto storico pubblico e databile? Rispondi solo col JSON.`,
      },
    ],
  });

  const testoRisposta = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const match = testoRisposta.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]);
    if (!j.trovato || !j.corpo) return null;
    return {
      corpo: String(j.corpo).trim(),
      fonte_nome: j.fonte_nome ? String(j.fonte_nome) : null,
      fonte_url: j.fonte_url ? String(j.fonte_url) : null,
    };
  } catch {
    return null;
  }
}
