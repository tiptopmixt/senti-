/**
 * Chiamate a OpenAI, limitate a ciò che Anthropic NON offre:
 * trascrizione audio (Whisper) ed embedding.
 *
 * La narrazione unificata NON passa da qui: usa Claude (vedi anthropic.ts).
 * La chiave vive SOLO come secret della Edge Function.
 */
const BASE = "https://api.openai.com/v1";

const EMBED_MODEL = Deno.env.get("OPENAI_EMBED_MODEL") ?? "text-embedding-3-small";

function apiKey(): string {
  const k = Deno.env.get("OPENAI_API_KEY");
  if (!k) {
    throw new Error("OPENAI_API_KEY mancante nei secret della Edge Function");
  }
  return k;
}

/**
 * Trascrizione audio con Whisper.
 * `hints` sono i toponimi dell'area: passati come prompt, riducono di molto le
 * storpiature dei nomi di luogo locali.
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
  hints: string[],
  language = "it",
): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-1");
  form.append("language", language);
  if (hints.length > 0) {
    // Whisper accetta un solo prompt testuale: un elenco di toponimi funziona bene.
    form.append("prompt", hints.join(", "));
  }

  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper ha risposto ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return String(data.text ?? "").trim();
}

/** Embedding a 1536 dimensioni (coerente con la colonna vector(1536)). */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    throw new Error(`Embeddings ha risposto ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Embedding non valido");
  return vec as number[];
}

// La sintesi testuale è in _shared/anthropic.ts (Claude): qui restano solo
// trascrizione ed embedding, che Anthropic non fornisce.
