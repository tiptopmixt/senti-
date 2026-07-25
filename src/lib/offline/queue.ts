import {
  aggiornaMemoria,
  eliminaMemoria,
  memorieDaInviare,
  tutteLeMemorie,
  type MemoriaLocale,
} from "./db";
import { caricaAudio, pubblicaMemoriaAudio } from "@/lib/queries/contributions";

/**
 * Coda di invio delle memorie registrate.
 *
 * Sul campo la rete non c'è: in Valbrenta il segnale sparisce fra una parete di
 * roccia e l'altra. La registrazione si fa comunque, resta sul telefono, e
 * riparte da sola appena la rete torna.
 */

export interface StatoCoda {
  inAttesa: number;
  inCorso: boolean;
  online: boolean;
  ultimoErrore: string | null;
}

type Ascoltatore = (stato: StatoCoda) => void;

const ascoltatori = new Set<Ascoltatore>();
let elaborazioneInCorso = false;
let ultimoErrore: string | null = null;
let timerRitento: ReturnType<typeof setTimeout> | null = null;

function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function notifica(): Promise<void> {
  const inAttesa = (await memorieDaInviare()).length;
  const stato: StatoCoda = {
    inAttesa,
    inCorso: elaborazioneInCorso,
    online: online(),
    ultimoErrore,
  };
  for (const a of ascoltatori) a(stato);
}

/** Attesa crescente fra i tentativi: 2s, 4s, 8s… fino a 5 minuti. */
function attesaMs(tentativi: number): number {
  return Math.min(2000 * 2 ** tentativi, 300_000);
}

async function inviaUna(m: MemoriaLocale): Promise<void> {
  await aggiornaMemoria(m.id, { stato: "in_corso" });

  const percorso = await caricaAudio(m.id, m.blob, m.mimeType);

  await pubblicaMemoriaAudio({
    mediaPath: percorso,
    audioDurationMs: m.durataMs,
    poiId: m.poiId,
    note: m.nota,
    narratorName: m.narratoreNome,
    narratorBirthYear: m.narratoreAnnoNascita,
    eventYear: null,
    narratorConsent: m.consenso,
    isAnonymous: true,
    vocePropria: m.vocePropria,
    permessoTerzi: m.permessoTerzi,
    veridicita: m.veridicita,
  });

  // Inviata: il server ne è ora custode, liberiamo lo spazio sul telefono.
  await eliminaMemoria(m.id);
}

/** Prova a inviare tutto quello che è in attesa. Non lancia: registra gli errori. */
export async function elaboraCoda(): Promise<void> {
  if (elaborazioneInCorso || !online()) return;

  elaborazioneInCorso = true;
  ultimoErrore = null;
  await notifica();

  try {
    for (const m of await memorieDaInviare()) {
      try {
        await inviaUna(m);
      } catch (e) {
        const messaggio = e instanceof Error ? e.message : String(e);
        ultimoErrore = messaggio;
        const tentativi = m.tentativi + 1;
        await aggiornaMemoria(m.id, {
          stato: "errore",
          tentativi,
          ultimoErrore: messaggio,
        });
        // Riprova più tardi, senza martellare il server.
        if (timerRitento) clearTimeout(timerRitento);
        timerRitento = setTimeout(() => void elaboraCoda(), attesaMs(tentativi));
        break;
      }
    }
  } finally {
    elaborazioneInCorso = false;
    await notifica();
  }
}

/**
 * Avvia la coda e resta in ascolto della rete.
 * Restituisce la funzione per smettere di ascoltare.
 */
export function avviaCoda(ascoltatore: Ascoltatore): () => void {
  ascoltatori.add(ascoltatore);

  const suOnline = () => void elaboraCoda();
  const suOffline = () => void notifica();

  window.addEventListener("online", suOnline);
  window.addEventListener("offline", suOffline);

  void notifica();
  void elaboraCoda();

  return () => {
    ascoltatori.delete(ascoltatore);
    window.removeEventListener("online", suOnline);
    window.removeEventListener("offline", suOffline);
  };
}

export { tutteLeMemorie };
