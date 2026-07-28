/**
 * Coda offline delle memorie.
 *
 * Se la pubblicazione fallisce perché manca la rete, la memoria (dati + foto)
 * resta in una coda locale (IndexedDB) e viene ripubblicata da sola appena la
 * rete torna. Niente va perso; l'utente vede lo stato "in attesa di rete".
 */
import type { NuovoRitrovamento } from "@/lib/validation";
import { caricaFoto, pubblicaRitrovamento } from "@/lib/queries/contributions";

const DB = "senti-coda";
const STORE = "memorie";

export interface MemoriaLocale {
  id: string;
  params: NuovoRitrovamento; // mediaPath viene impostato al momento dell'invio
  fotoBlob?: Blob;
  fotoMime?: string;
  creataIl: number;
  tentativi: number;
}

export interface StatoCoda {
  online: boolean;
  inAttesa: number;
}

function apri(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tutte(): Promise<MemoriaLocale[]> {
  const db = await apri();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as MemoriaLocale[]);
    req.onerror = () => reject(req.error);
  });
}

async function salva(m: MemoriaLocale): Promise<void> {
  const db = await apri();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(m);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function rimuovi(id: string): Promise<void> {
  const db = await apri();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function conta(): Promise<number> {
  return (await tutte()).length;
}

/** Un errore è "di rete" (temporaneo) e non un rifiuto del server? */
function eDiRete(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network error|load failed/i.test(msg);
}

/** Prova a pubblicare una memoria: carica la foto (se c'è) e chiama la RPC. */
async function pubblicaUna(m: MemoriaLocale): Promise<void> {
  let mediaPath = m.params.mediaPath;
  if (m.fotoBlob) {
    mediaPath = await caricaFoto(m.id, m.fotoBlob, m.fotoMime ?? "image/jpeg");
  }
  await pubblicaRitrovamento({ ...m.params, mediaPath });
}

/**
 * Salva una memoria: prova subito online; se fallisce per rete assente la mette
 * in coda. Gli errori NON di rete (validazione, permessi) vengono rilanciati per
 * mostrarli all'utente. Ritorna lo stato finale.
 */
export async function salvaMemoria(
  params: NuovoRitrovamento,
  fotoBlob?: Blob,
  fotoMime?: string,
): Promise<"inviata" | "in_coda"> {
  const m: MemoriaLocale = {
    id: crypto.randomUUID(),
    params,
    fotoBlob,
    fotoMime,
    creataIl: Date.now(),
    tentativi: 0,
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await salva(m);
    return "in_coda";
  }

  try {
    await pubblicaUna(m);
    return "inviata";
  } catch (e) {
    if (eDiRete(e)) {
      await salva(m);
      return "in_coda";
    }
    throw e; // errore reale (validazione/permessi): lo vede l'utente
  }
}

// Evita che due esecuzioni concorrenti (mount + evento "online") ripubblichino
// lo stesso elemento prima che venga rimosso → doppioni.
let elaborazioneInCorso = false;

/** Riprova a inviare tutte le memorie in coda. */
export async function elaboraCoda(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (elaborazioneInCorso) return;
  elaborazioneInCorso = true;
  try {
    for (const m of await tutte()) {
      try {
        await pubblicaUna(m);
        await rimuovi(m.id);
      } catch (e) {
        if (!eDiRete(e)) await rimuovi(m.id); // errore non recuperabile: non insistere
        // errore di rete: resta in coda per il prossimo giro
      }
    }
  } finally {
    elaborazioneInCorso = false;
  }
}

/** Avvia il monitoraggio: rielabora la coda quando torna la rete. */
export function avviaCoda(onStato: (s: StatoCoda) => void): () => void {
  let vivo = true;
  const aggiorna = async () => {
    if (!vivo) return;
    onStato({
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      inAttesa: await conta().catch(() => 0),
    });
  };
  const alRitornoRete = () => {
    void elaboraCoda().then(aggiorna);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", alRitornoRete);
  }
  void elaboraCoda().then(aggiorna);
  const timer = setInterval(aggiorna, 5000);

  return () => {
    vivo = false;
    clearInterval(timer);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", alRitornoRete);
    }
  };
}
