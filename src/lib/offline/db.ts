/**
 * Archivio locale delle memorie registrate, su IndexedDB.
 *
 * Perché IndexedDB e non localStorage: qui dentro finisce l'audio vero (Blob),
 * che può pesare megabyte. localStorage tiene solo stringhe e ha un limite
 * risibile.
 *
 * Regola: una registrazione non lascia MAI il telefono prima di essere stata
 * salvata qui. Se la rete manca, l'app si chiude o la batteria finisce, la voce
 * del testimone non si perde.
 *
 * Scritto senza librerie: IndexedDB ha un'API verbosa ma sono ~80 righe, e ogni
 * dipendenza in più pesa sul budget di performance.
 */

const DB_NAME = "senti";
const DB_VERSION = 1;
const STORE = "memorie";

export type StatoInvio = "in_attesa" | "in_corso" | "inviata" | "errore";

export interface MemoriaLocale {
  id: string;
  /** L'audio originale. È la memoria: non viene mai sostituito dal testo. */
  blob: Blob;
  mimeType: string;
  durataMs: number;
  creataIl: number;

  // Dati del testimone.
  narratoreNome: string | null;
  narratoreAnnoNascita: number | null;
  consenso: boolean;

  /** Nota di chi raccoglie: indice di servizio, non le parole del testimone. */
  nota: string | null;
  poiId: string | null;

  // Dichiarazione per-contenuto (la prova specifica, salvata all'invio).
  vocePropria: boolean;      // true = la mia storia; false = di un'altra persona
  permessoTerzi: boolean;    // se non è mia, dichiaro di avere il permesso
  veridicita: boolean;       // è vera per quanto ne so

  stato: StatoInvio;
  tentativi: number;
  ultimoErrore: string | null;
}

function apriDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("stato", "stato", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB non disponibile"));
  });
}

async function conStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await apriDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Operazione IndexedDB fallita"));
    });
  } finally {
    db.close();
  }
}

export async function salvaMemoria(m: MemoriaLocale): Promise<void> {
  await conStore("readwrite", (s) => s.put(m));
}

export async function leggiMemoria(id: string): Promise<MemoriaLocale | undefined> {
  return conStore("readonly", (s) => s.get(id) as IDBRequest<MemoriaLocale | undefined>);
}

export async function tutteLeMemorie(): Promise<MemoriaLocale[]> {
  const all = await conStore(
    "readonly",
    (s) => s.getAll() as IDBRequest<MemoriaLocale[]>,
  );
  return all.sort((a, b) => b.creataIl - a.creataIl);
}

/** Memorie da inviare: mai spedite, o rimaste indietro per un errore. */
export async function memorieDaInviare(): Promise<MemoriaLocale[]> {
  const all = await tutteLeMemorie();
  return all.filter((m) => m.stato === "in_attesa" || m.stato === "errore");
}

export async function aggiornaMemoria(
  id: string,
  patch: Partial<MemoriaLocale>,
): Promise<void> {
  const attuale = await leggiMemoria(id);
  if (!attuale) return;
  await salvaMemoria({ ...attuale, ...patch });
}

export async function eliminaMemoria(id: string): Promise<void> {
  await conStore("readwrite", (s) => s.delete(id));
}
