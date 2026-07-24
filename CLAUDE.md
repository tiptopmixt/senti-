# Senti — regole di progetto

"Senti": una mappa di percorsi e sentieri arricchiti dalla memoria delle persone.
Territorio pilota: Bassano del Grappa, Valbrenta, Altopiano di Asiago.
Lingua di interfaccia, contenuti e commenti: **italiano**.

## I due livelli non si fondono mai

- **Campagne**: contenuto editoriale/storico, con fonti citate. Scrivono solo i curatori.
- **Memorie**: contributi degli utenti su luoghi e sentieri. Regola stretta:
  **l'IA usa solo ciò che dice il testimone, non aggiunge contesto storico.**

## Invarianti da non violare mai

1. **`author_id` non compare in NESSUNA risposta pubblica.** Le letture pubbliche
   passano solo dalle viste `v_*_public`. La RLS filtra righe, non colonne: senza le
   viste l'anonimato non esiste. Le viste non sono una comodità, sono il meccanismo
   di privacy.
2. **Nessuna scrittura sul ledger punti dal client.** `points_ledger` è append-only;
   ci scrivono solo trigger e RPC. I punti nascono **all'approvazione**, non alla
   pubblicazione.
3. **Ogni tabella nuova nasce con RLS attiva e policy esplicite nella stessa
   migrazione.**
4. **Nessuna migrazione già applicata viene modificata.** Se serve un cambiamento,
   si crea una nuova migrazione.
5. **Query DB solo in `src/lib/queries/`**, con validazione **zod** al confine
   (ogni dato che entra o esce dal DB viene validato).
6. **Coordinate sensibili offuscate** in modo deterministico: un POI con `hazard_flag`
   non espone mai le coordinate esatte.
7. **Certezza sempre visibile**: percorsi `attestato`/`probabile`/`ipotetico` →
   linea continua/tratteggiata/punteggiata. Gli import (Wikidata/OSM) nascono
   `ipotetico` e diventano `attestato` solo quando un curatore allega una fonte.

## L'audio è la memoria

- **L'audio originale non viene MAI sostituito dal testo.** La registrazione del
  testimone è la memoria: voce, dialetto, pause, esitazioni. Nessuna
  trascrizione è più fedele dell'originale. Il player audio è l'elemento
  principale della memoria, non un allegato.
- **Nessuna IA genera audio.** L'audio esiste solo perché una persona ha parlato.
- **Ogni testo dichiara la propria origine.** Il campo `text_source` dice se il
  testo è stato scritto dal raccoglitore o prodotto da una macchina. L'interfaccia
  lo mostra sempre: mai spacciare un testo per le parole del testimone.
- **Trascrizione automatica: predisposta ma spenta.** La Edge Function
  `transcribe` esiste e rispetta il consenso, ma non è attiva. Si accende solo
  se e quando servirà. (Motivo tecnico: Whisper storpia dialetto veneto/cimbro
  e toponimi locali; chi raccoglie la memoria scrive meglio.)

## I tre ruoli dell'IA

L'IA in Senti fa esattamente tre cose, tutte **testuali**:

1. **Guida per l'utente** — assistente in chat che spiega come si usa l'app
   (registrare, consenso, aggiungere un luogo). Non è una chat social fra
   utenti: quella resta fuori.
2. **Aiuto alla curatrice** — riassume le memorie in attesa, segnala possibili
   duplicati e date discordanti, propone collegamenti. **La decisione resta
   sempre umana**: l'IA suggerisce, non approva.
3. **Narrazione dei luoghi** — unisce le memorie di un luogo citando i
   testimoni, senza appianare i conflitti e senza aggiungere contesto storico.

Fuori da questi tre ruoli l'IA non interviene.

## Sicurezza e segreti

- `OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` esistono **solo** come secret delle
  Edge Functions. Se compaiono nel bundle client è un **bug bloccante**.
- Nel client si usa solo la **anon key** (`NEXT_PUBLIC_*`). Mai la service_role key.
- Prima riga di `.gitignore`: `.env.local`. Nessun segreto in un commit.

## Architettura di deploy (vincolo, non dettaglio finale)

- Solo due servizi: **GitHub** e **Supabase**. Codice su GitHub (repo privato).
- Frontend **Next.js con `output: "export"`**: sito statico su **GitHub Pages** via
  GitHub Actions a ogni push su `main`. **NESSUNA route API di Next.**
- **Tutta** la logica server sta in **Supabase Edge Functions (Deno)**: trascrizione
  Whisper, narrazione unificata, pagine pubbliche condivisibili con meta tag Open Graph.
- Due progetti Supabase distinti: **sviluppo** e **produzione**. Il **seed gira solo
  su sviluppo**.

## Esperienza utente (obiettivi primari)

- **Mobile-first**: lo smartphone è il dispositivo principale. Bottoni grandi, uso col
  pollice, GPS "Sono qui", tocco lungo sulla mappa. Supporto **PWA** (installabile a
  schermata Home, schermo intero) senza App Store.
- **Veloce**: sito statico su CDN, JS minimo, mappa MapLibre GL efficiente (vettori su
  GPU). Ogni step ha un budget di performance; la mappa è la parte più pesante e va
  tenuta d'occhio.

## Modalità test (due persone, senza registrazione)

- **Login anonimo Supabase** alla prima apertura, nessuna schermata di accesso.
  L'`user_id` è reale: RLS e ledger funzionano come in produzione. Previsto
  `linkIdentity` per l'upgrade futuro a email, con conservazione dei punti maturati.
- **Mai** disattivare la RLS né usare la service_role key nel client per aggirarla:
  l'anonimato pubblico è la prima cosa da testare.
- Selettore utenti demo (Anna con storico, Marco nuovo, Curatrice `is_curator=true`)
  visibile solo se `NEXT_PUBLIC_DEMO=true`. Con la variabile spenta spariscono sia il
  selettore sia ogni traccia del seed.

## Multilingua

- Interfaccia **multilingua**: **italiano (default) + inglese**. Con l'export statico
  l'i18n integrato di Next non è disponibile → si usa **`next-intl`** con segmento
  `[locale]` (`/it`, `/en`) pre-generato staticamente. Niente middleware (richiede un
  server): locali via `generateStaticParams` + `setRequestLocale`.
- I **contenuti** sono multilingua nel DB:
  - Testi **editoriali** (campagne, narrazioni curate, descrizioni luoghi) previsti in
    più lingue fin dalle migrazioni (campo `lang` / tabella traduzioni).
  - Le **memorie degli utenti** restano nella lingua originale del testimone. Una
    traduzione è ammessa solo se **marcata esplicitamente come traduzione**, mai
    spacciata per le parole del testimone.

## Stack

Next.js (export statico) + TypeScript strict + MapLibre GL + Supabase
(PostgreSQL, PostGIS, pgvector, Auth, Storage, Edge Functions) + OpenAI.

## Ordine di costruzione

Un punto per volta; ci si ferma dopo ciascuno, si mostra il risultato e si aspetta
conferma. Vedi il prompt di progetto per la lista completa (schema 0001-0003,
testimoni/luoghi 0004, percorsi 0005, seed, test pgTAP, Edge Functions, cattura audio,
mappa, "Cosa è successo qui", dashboard /io + 0006, deploy).

## Cosa NON costruire (ora)

Classifica pubblica, badge, profili social, feed di attività, chat, pagamenti.

---

@AGENTS.md
