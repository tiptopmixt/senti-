# Senti

Una mappa di percorsi e sentieri arricchiti dalla memoria delle persone.
Territorio pilota: Bassano del Grappa, Valbrenta, Altopiano di Asiago.

Stack: **Next.js** (export statico) + TypeScript + MapLibre GL + **Supabase**
(PostgreSQL/PostGIS/pgvector, Auth, Storage, Edge Functions) + IA.

Architettura di deploy: **solo due servizi**, GitHub e Supabase. Il frontend è
un sito statico su **GitHub Pages**; tutta la logica server sta nelle **Supabase
Edge Functions**. (Unica eccezione consapevole: le tessere della mappa arrivano
da OpenFreeMap — vedi `CLAUDE.md`.)

---

## Sviluppo in locale

Serve **Docker Desktop** (per lo stack Supabase locale) e **Node 20+**.

```bash
npm install
supabase start                 # avvia Postgres, Auth, Storage, Edge Functions
supabase db reset              # applica migrazioni 0001-… ED esegue il seed (solo dev)
cp .env.local.example .env.local   # poi incolla URL e anon key da `supabase status`
npm run dev                    # http://localhost:3000
```

- `NEXT_PUBLIC_DEMO=true` in `.env.local` mostra il selettore utenti demo
  (Anna / Marco / Curatrice, password `demo123456`) e i dati del seed.
- I secret delle Edge Functions vanno in `supabase/functions/.env`
  (vedi `supabase/functions/.env.example`). In locale:
  `supabase functions serve --env-file supabase/functions/.env`.

### Test degli invarianti

```bash
supabase test db               # suite pgTAP: privacy, ledger, consensi, limiti…
```

---

## Deploy in produzione

Due progetti Supabase distinti — **sviluppo** e **produzione** — e un repository
GitHub **privato**. Il seed gira **solo** in sviluppo.

### 1. Progetti Supabase

Crea due progetti su [supabase.com](https://supabase.com): uno `senti-dev`, uno
`senti-prod`. Per ciascuno, dal terminale:

```bash
supabase login
./scripts/deploy-supabase.sh <project-ref>   # applica migrazioni + Edge Functions
```

Lo script ricorda gli ultimi passi manuali (una volta per progetto):

- **Secret delle Edge Functions**: `supabase secrets set --env-file supabase/functions/.env`.
  Devono contenere `ANTHROPIC_API_KEY` (narrazione, aiuto curatrice, contesto
  storico) e, solo se attivi la trascrizione, `OPENAI_API_KEY`. Imposta anche
  `SENTI_FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1`.
  **La `service_role` key non va MAI nel frontend**, solo qui.
- **Authentication → Providers**: abilita **Anonymous sign-ins** (è il login di
  base). Google/Facebook sono un'aggiunta futura, con la sola email.

> Il **seed non va mai in produzione**: `supabase db push` applica solo le
> migrazioni. In produzione non esistono utenti demo.

### 2. Repository GitHub (privato)

```bash
git remote add origin git@github.com:<tuo-utente>/senti.git
git push -u origin main
```

Poi, in **Settings** del repo:

- **Pages** → Source: **GitHub Actions**.
- **Secrets and variables → Actions**:
  - *Secrets*: `NEXT_PUBLIC_SUPABASE_URL` (URL del progetto **prod**) e
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la **publishable/anon** key di prod — mai la
    service_role).
  - *Variables* (facoltative): `NEXT_PUBLIC_BASE_PATH` (`/senti` se è una
    "project page" tipo `utente.github.io/senti`; vuoto con dominio custom),
    `NEXT_PUBLIC_MAP_TILES_URL`, `NEXT_PUBLIC_MAP_FONTS_URL`.

`NEXT_PUBLIC_DEMO` è forzato a `false` nel workflow: in produzione il selettore
demo e ogni traccia del seed spariscono.

### 3. Pubblicazione

Ogni **push su `main`** lancia il workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml):
build statica → pubblicazione su Pages. Il redirect del dominio nudo e il
`.nojekyll` sono generati da `scripts/post-build.mjs`.

### 4. Dominio (facoltativo)

In **Settings → Pages → Custom domain** imposta il dominio e crea il record DNS
indicato. Con dominio custom lascia `NEXT_PUBLIC_BASE_PATH` vuoto.

---

## Da provare su dispositivi veri

Due cose non sono verificabili in un ambiente headless e vanno provate al primo
giro coi tester:

- **Registrazione audio** (serve un microfono): cattura, forma d'onda, coda
  offline.
- **Resa della mappa** (serve un browser che compone i frame): stile carta
  antica, linee di certezza, filtri.

Le funzioni IA (narrazione, aiuto curatrice, contesto storico) girano solo con
`ANTHROPIC_API_KEY` impostata nei secret delle Edge Functions.

---

## Struttura

```
src/app/[locale]/        pagine (it/en) — export statico
src/components/          UI (cattura, mappa, colonna del tempo, moderazione, …)
src/lib/queries/         accesso al DB (solo qui), con validazione zod al confine
supabase/migrations/     schema (0001-…), immutabili una volta applicate
supabase/functions/      Edge Functions (Deno): share, narrative, transcribe, curate, context
supabase/tests/          suite pgTAP degli invarianti
```

Le regole di progetto e gli invarianti da non violare sono in [`CLAUDE.md`](CLAUDE.md).
