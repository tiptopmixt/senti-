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

/** Foto passata al modello: byte grezzi + tipo MIME (jpeg/png/webp/gif). */
export interface FotoInput {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

/**
 * "Ipotesi dell'assistente": UN commento breve al condizionale su cosa POTREBBE
 * essere un ritrovamento (foto + testo). Riquadro SEPARATO dalla memoria: non è
 * una prova, non giudica se la memoria è vera.
 *
 * Regole di sicurezza dure (nel prompt): se sembra un residuato bellico/ordigno
 * il modello lo segnala con `residuato: true` e NON scrive mai come maneggiarlo;
 * l'avviso "chiama il 112" lo aggiunge il server, sempre uguale. Mai incoraggia
 * a raccogliere o scavare.
 *
 * Restituisce null se non c'è nulla di utile o se il modello rifiuta: in quel
 * caso la memoria resta pubblicata lo stesso, senza riquadro.
 */
export async function ipotesiAssistente(input: {
  testo: string;
  foto?: FotoInput;
  percorsiVicini?: string[];
}): Promise<{ commento: string; residuato: boolean } | null> {
  const testo = (input.testo ?? "").trim();
  if (!testo && !input.foto) return null;

  const bloccoPercorsi = (input.percorsiVicini ?? []).length > 0
    ? `\n\nPERCORSI STORICI NELLA ZONA (dai dati dell'app, confermati):
${input.percorsiVicini!.map((n) => `- ${n}`).join("\n")}

Se la zona è attraversata da un percorso storico, PUOI aggiungere UNA frase di contesto geografico al condizionale, tipo: "Questa zona potrebbe essere attraversata dal percorso storico di [nome]." Serve solo a inquadrare il luogo, NON a indicare dove cercare.
REGOLE FERREE sui percorsi:
- NON suggerire MAI che lungo il percorso si possano trovare oggetti o reperti. NON invitare a cercarli, raccoglierli o scavare.
- NON indicare un punto preciso: parla della zona in generale.
- Se "residuato" è true (sospetto residuato bellico), NON menzionare NESSUN percorso: prevale SOLO l'avviso di sicurezza.
- Nomina un percorso SOLO se è nella lista qui sopra. Se la lista è vuota, non scrivere nulla sui percorsi.
- Frase al condizionale e breve, coerente col resto del commento.`
    : "";

  const system = `Sei l'assistente IA di "Senti", un'app che mappa ritrovamenti sul campo (reperti storici, militari, minerali, fossili) sulle rotte dei grandi condottieri. Guardi la foto e/o il testo di un ritrovamento pubblicato da una persona e scrivi una breve IPOTESI su cosa POTREBBE essere. È un riquadro separato "Ipotesi dell'assistente", non fa parte della memoria della persona.

Regole assolute:
- Scrivi SEMPRE al condizionale ("potrebbe essere", "sembrerebbe", "potrebbe trattarsi di"). MAI certezze.
- 2-4 frasi, in italiano semplice e diretto.
- NON giudicare se la memoria è vera o falsa. Non dire "confermo", "è autentico", "è un falso". Offri solo un possibile inquadramento.
- Se dall'immagine/testo NON si capisce cosa sia, dillo con onestà ("non è identificabile con sicurezza da una foto") e non inventare.
- Se citi un fatto storico databile, presentalo come contesto POSSIBILE, sempre al condizionale.
- NON incoraggiare MAI a raccogliere, scavare, spostare o portare via il reperto. Se è pertinente, ricorda con calma che raccogliere reperti può essere vietato dalla legge.

SICUREZZA (prioritaria su tutto): se il ritrovamento potrebbe essere un RESIDUATO BELLICO, una munizione, una granata, una bomba o un ordigno (anche solo un dubbio):
- imposta "residuato": true;
- NON dare MAI istruzioni per maneggiarlo, disinnescarlo, aprirlo o spostarlo;
- nel commento invita a non toccarlo. (L'avviso ufficiale con il numero da chiamare lo aggiunge l'app.)
- NON menzionare percorsi o sentieri: solo l'avviso di sicurezza.
In tutti gli altri casi "residuato": false.${bloccoPercorsi}

Rispondi SOLO con un oggetto JSON, senza altro testo:
{"commento": "2-4 frasi al condizionale", "residuato": true|false}`;

  const contenutoUtente: Anthropic.ContentBlockParam[] = [];
  if (input.foto) {
    contenutoUtente.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.foto.mimeType,
        data: input.foto.base64,
      },
    });
  }
  contenutoUtente.push({
    type: "text",
    text: testo
      ? `Descrizione data da chi ha pubblicato:\n"${testo}"\n\nCosa potrebbe essere? Rispondi solo col JSON.`
      : `Non c'è una descrizione, solo la foto. Cosa potrebbe essere? Rispondi solo col JSON.`,
  });

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: contenutoUtente }],
  });

  if (response.stop_reason === "refusal") return null;

  const testoRisposta = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const match = testoRisposta.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]);
    const commento = j.commento ? String(j.commento).trim() : "";
    if (!commento) return null;
    return { commento, residuato: j.residuato === true };
  } catch {
    return null;
  }
}
