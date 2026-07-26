# Senti — regole di progetto

"Senti": una **mappa mondiale dei ritrovamenti**, appoggiata sulle grandi rotte di
guerra dei condottieri della storia. I percorsi principali sono già tracciati; gli
utenti li arricchiscono con i loro ritrovamenti.
Condottieri/campagne pilota: Napoleone, Cesare, Alessandro Magno, Impero Romano
(Traiano), Impero Ottomano, Gengis Khan, Annibale, Tamerlano, Sengoku, Tre Regni,
Prima e Seconda Guerra Mondiale, Crociate, Attila (almeno 14).
Lingua di interfaccia, contenuti e commenti: **italiano**.

## I due livelli non si fondono mai

- **Campagne**: contenuto editoriale/storico dei percorsi, con fonti citate. I
  percorsi (routes/route_segments/commanders) li aggiunge **lo sviluppatore** via
  migrazioni/seed, non un'interfaccia utente.
- **Ritrovamenti**: contributi degli utenti su un luogo. L'utente sceglie prima
  una **categoria/icona** (`finding_type`: battaglia, munizioni, equipaggiamento,
  fortificazione, caduti, tesori, minerali, fossili, archeologico, monumento,
  aneddoto, foto_storica) e poi aggiunge foto e/o testo. Regola stretta:
  **un ritrovamento dell'utente non viene mai spacciato per fatto attestato.**

## Invarianti da non violare mai

1. **`author_id` non compare in NESSUNA risposta pubblica.** Le letture pubbliche
   passano solo dalle viste `v_*_public`. La RLS filtra righe, non colonne: senza le
   viste l'anonimato non esiste. Le viste non sono una comodità, sono il meccanismo
   di privacy.
2. **Nessuna scrittura sul ledger punti dal client.** `points_ledger` è append-only;
   ci scrivono solo trigger e RPC. I ritrovamenti sono **pubblici subito**: i punti
   nascono **alla pubblicazione**.
3. **Ogni tabella nuova nasce con RLS attiva e policy esplicite nella stessa
   migrazione.**
4. **Le migrazioni applicate in produzione non si modificano.** In fondazione
   (pre-produzione) è ammesso **consolidare** la serie riscrivendola pulita; una
   volta in produzione, ogni cambiamento è una nuova migrazione.
5. **Query DB solo in `src/lib/queries/`**, con validazione **zod** al confine
   (ogni dato che entra o esce dal DB viene validato).
6. **Coordinate sensibili offuscate** in modo deterministico: un ritrovamento con
   `hazard_flag` (es. un **tesoro** o un sito di scavo da proteggere) non espone mai
   le coordinate esatte.
7. **Certezza sempre visibile**: percorsi/segmenti `attestato`/`probabile`/`ipotetico`
   → linea continua/tratteggiata/punteggiata. Un segmento è `attestato` solo se ha
   almeno una fonte. I ritrovamenti degli utenti nascono `ipotetico`.

## Nessuna IA genera contenuti spacciati per prova

- **Nessuna IA genera foto o falsi reperti.** Le foto esistono solo perché una
  persona le ha scattate/caricate. L'IA non fabbrica prove.
- **Ogni contenuto dichiara la propria origine e responsabilità.** Chi pubblica
  dichiara se il contenuto è proprio o di terzi (con permesso) e ne garantisce la
  veridicità (`contribution_declarations`, append-only).
- **Niente audio.** Senti non registra testimoni: i ritrovamenti si documentano con
  **foto e testo**. (Storicamente esisteva un ramo "memoria orale": è stato rimosso.)

## I tre ruoli dell'IA

L'IA in Senti fa esattamente tre cose, tutte **testuali**:

1. **Guida per l'utente** — assistente in chat che spiega come si usa l'app
   (scegliere l'icona, aggiungere un ritrovamento, consenso). Non è una chat social.
2. **Aiuto ai moderatori** — riassume i contenuti segnalati, segnala possibili
   duplicati e conflitti. **La decisione resta sempre umana**: l'IA suggerisce.
3. **Narrazione dei luoghi + contesto storico** — unisce i ritrovamenti di un luogo
   citando gli autori, e può aggiungere **contesto storico documentato con fonti**,
   in un **riquadro visibilmente separato** (`contribution_context`). Il contesto
   non dice mai se il ritrovamento dell'utente è vero: i due livelli restano distinti.

Fuori da questi tre ruoli l'IA non interviene.

## Consensi, responsabilità, dati minimi

- **Due livelli di consenso.** Termini/privacy/cookie si chiedono **una volta**,
  legati a `user_id` + versione: se un testo cambia versione, chi aveva accettato la
  precedente va reinformato. Le dichiarazioni sul singolo contenuto (voce propria /
  permesso di terzi / veridicità) si chiedono a **ogni pubblicazione** e si
  **salvano davvero** (`contribution_declarations`, append-only).
- **Pubblicazione immediata + responsabilità.** I ritrovamenti sono online subito.
  Proprio per questo ogni utente risponde in prima persona della verità e della
  liceità di ciò che pubblica; la piattaforma non garantisce l'esattezza storica.
  La moderazione interviene **dopo, su segnalazione** (`content_reports`); oltre una
  soglia il contenuto sale in cima alla coda dei moderatori.
- **Contesto storico separato.** Se l'IA aggiunge contesto, è un riquadro
  visibilmente distinto con fonte citata: non dice mai se il ritrovamento è vero, e
  senza fonte affidabile non scrive nulla.
- **Avviso di prova sempre visibile.** L'app è in prova ed è fatta con l'aiuto
  dell'IA: può contenere errori. L'avviso è nell'intro e nel footer di ogni pagina.
- **Dati minimi, nessun dato sensibile.** L'impostazione di base è **anonima**:
  nessuna email, nessuna password, nessun nome. L'upgrade futuro a un account serve
  solo al recupero cross-dispositivo e chiede **solo un'email** (o Google/Facebook,
  **senza mai estrarre dati sensibili**). I punti maturati da anonimo si conservano
  (`linkIdentity`).

## Sicurezza e segreti

- `ANTHROPIC_API_KEY` (e, solo se un domani servisse, altre chiavi) e
  `SUPABASE_SERVICE_ROLE_KEY` esistono **solo** come secret delle Edge Functions. Se
  compaiono nel bundle client è un **bug bloccante**.
- Nel client si usa solo la **anon key** (`NEXT_PUBLIC_*`). Mai la service_role key.
- Prima riga di `.gitignore`: `.env.local`. Nessun segreto in un commit.

## Architettura di deploy (vincolo, non dettaglio finale)

- Solo due servizi: **GitHub** e **Supabase**. Codice su GitHub (repo privato).
- Frontend **Next.js con `output: "export"`**: sito statico su **GitHub Pages** via
  GitHub Actions a ogni push su `main`. **NESSUNA route API di Next.**
- **Tutta** la logica server sta in **Supabase Edge Functions (Deno)**: narrazione
  unificata, contesto storico, pagine pubbliche condivisibili con meta tag Open Graph.
- Due progetti Supabase distinti: **sviluppo** e **produzione**. Il **seed gira solo
  su sviluppo**.
- **Eccezione consapevole al "solo due servizi"**: le tessere vettoriali della mappa
  (mondiale) arrivano da **OpenFreeMap** (gratuito, senza chiave). È un terzo
  servizio esterno, accettato deliberatamente. Configurabile via
  `NEXT_PUBLIC_MAP_TILES_URL`. Su scala mondiale l'ipotesi di un estratto PMTiles
  locale non è più praticabile: la dipendenza da OpenFreeMap è strutturale.

## Esperienza utente (obiettivi primari)

- **Mobile-first**: lo smartphone è il dispositivo principale. Bottoni grandi, uso
  col pollice, GPS "Sono qui", tocco lungo sulla mappa per segnare un ritrovamento.
  Supporto **PWA** (installabile a schermata Home) senza App Store.
- **Veloce**: sito statico su CDN, JS minimo, mappa MapLibre GL efficiente. La mappa
  mondiale è la parte più pesante e va tenuta d'occhio.

## Modalità test (due persone, senza registrazione)

- **Login anonimo Supabase** alla prima apertura, nessuna schermata di accesso.
  L'`user_id` è reale: RLS e ledger funzionano come in produzione. Previsto
  `linkIdentity` per l'upgrade futuro a email, con conservazione dei punti.
- **Mai** disattivare la RLS né usare la service_role key nel client: l'anonimato
  pubblico è la prima cosa da testare.
- Selettore utenti demo (Anna con ritrovamenti, Marco nuovo, Moderatore
  `is_moderator=true`) visibile solo se `NEXT_PUBLIC_DEMO=true`.

## Multilingua

- Interfaccia **multilingua**: **italiano (default) + inglese** via **`next-intl`**
  con segmento `[locale]` (`/it`, `/en`) pre-generato staticamente (niente
  middleware: `generateStaticParams` + `setRequestLocale`).
- I **contenuti editoriali** (campagne, narrazioni, contesto storico) sono previsti
  in più lingue. I **ritrovamenti degli utenti** restano nella lingua originale;
  una traduzione è ammessa solo se **marcata esplicitamente come traduzione**.

## Stack

Next.js (export statico) + TypeScript strict + MapLibre GL + Supabase
(PostgreSQL, PostGIS, pgvector, Auth, Storage, Edge Functions) + IA testuale.

## Modello dati (migrazioni consolidate 0001–0008)

`0001` fondamenta (enum, profiles, `is_moderator`, offuscamento) · `0002`
impostazioni · `0003` luoghi/ritrovamenti (pois con `finding_type`, contributions
foto/testo, viste pubbliche) · `0004` punti (alla pubblicazione) + narrazioni ·
`0005` condottieri/percorsi + "Cosa è successo qui" · `0006` consensi/dichiarazioni +
`pubblica_ritrovamento` + contesto storico · `0007` segnalazioni/moderazione ·
`0008` dashboard `/io`.

## Cosa NON costruire (ora)

Classifica pubblica, badge, profili social, feed di attività, chat, pagamenti,
generazione di audio o immagini con IA.

---

@AGENTS.md
