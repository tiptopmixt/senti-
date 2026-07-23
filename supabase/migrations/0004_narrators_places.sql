-- =============================================================================
-- 0004_narrators_places.sql — Testimoni e luoghi da raccontare
--
-- - contributions: dati del testimone (narratore) e consenso. Se il consenso è
--   falso il contributo resta privato e NON è trascrivibile (Whisper non parte).
-- - places: centri abitati (import GeoNames > 500 abitanti) + vista dei luoghi
--   "da raccontare" (quante memorie entro 1 km).
-- - events: telemetria minima (user_id opzionale).
-- =============================================================================

-- --- contributions: testimone e consenso ------------------------------------
alter table public.contributions
  add column narrator_name       text,
  add column narrator_birth_year integer,
  add column narrator_consent    boolean not null default false,
  add column collected_by        uuid default auth.uid() references auth.users (id) on delete set null;

-- Anno di nascita plausibile (se indicato).
alter table public.contributions
  add constraint contributions_birth_year_sane
  check (
    narrator_birth_year is null
    or narrator_birth_year between 1850 and extract(year from now())::int
  );

-- INVARIANTE consenso: senza consenso del narratore non può esistere una
-- trascrizione. È il presidio a livello DB del "Whisper non parte senza consenso".
alter table public.contributions
  add constraint contributions_transcript_needs_consent
  check (transcript is null or narrator_consent = true);

-- La memoria diventa pubblica solo con consenso del narratore: aggiorno la vista
-- pubblica (aggiungo il filtro sul consenso e i dati del testimone, che sono ciò
-- che va mostrato — l'autore/raccoglitore resta comunque nascosto).
-- NB: CREATE OR REPLACE mantiene le colonne esistenti nello stesso ordine e ne
-- aggiunge di nuove in coda.
create or replace view public.v_contributions_public as
select
  c.id,
  c.poi_id,
  c.kind,
  case when c.kind = 'testo' then c.body else null end as body,
  c.transcript,
  c.media_path,
  c.is_anonymous,
  case when c.is_anonymous then a.label else pr.display_name end as author_label,
  case when c.is_anonymous then a.public_id else null end as author_public_id,
  c.created_at,
  c.narrator_name,
  c.narrator_birth_year
from public.contributions c
left join public.anon_aliases a on a.author_id = c.author_id
left join public.profiles pr on pr.id = c.author_id
where c.status = 'approvato'
  and c.narrator_consent = true;

-- --- places (centri abitati, import GeoNames) --------------------------------
-- Dati di riferimento pubblici: la chiave è il geonameid. Nessun author_id.
create table public.places (
  id           bigint primary key,          -- geonameid
  name         text not null,
  ascii_name   text,
  population   integer,
  admin1       text,                          -- codice regione/provincia
  country_code text,
  feature_code text,
  geog         geography(Point, 4326) not null,
  created_at   timestamptz not null default now()
);
create index places_geog_idx on public.places using gist (geog);
alter table public.places enable row level security;

-- Lettura pubblica (dato di riferimento senza privacy); scrittura solo curatori.
create policy places_select_all on public.places for select
  using (true);
create policy places_curator_write on public.places for all
  using (public.is_curator())
  with check (public.is_curator());

-- Luoghi "da raccontare": per ogni centro abitato, quante memorie (approvate e
-- con consenso) hanno un POI entro 1 km. Il filtro app userà memory_count basso.
create view public.v_places_to_tell as
select
  pl.id,
  pl.name,
  pl.population,
  pl.geog,
  st_y(pl.geog::geometry) as lat,
  st_x(pl.geog::geometry) as lon,
  count(c.id) as memory_count
from public.places pl
left join public.pois po
  on st_dwithin(po.geog, pl.geog, 1000)
left join public.contributions c
  on c.poi_id = po.id
  and c.status = 'approvato'
  and c.narrator_consent = true
group by pl.id, pl.name, pl.population, pl.geog;

-- --- events (telemetria) -----------------------------------------------------
-- Solo scrittura dal client (fire-and-forget); nessuna lettura lato client.
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,  -- opzionale
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_idx on public.events (name);
create index events_created_idx on public.events (created_at);
alter table public.events enable row level security;

-- Si può inserire solo un evento proprio (o senza utente, pre-login). Nessuna
-- policy di SELECT: i client non leggono la telemetria.
create policy events_insert_self on public.events for insert
  with check (user_id is null or user_id = auth.uid());

-- --- Grants ------------------------------------------------------------------
grant select on public.places to anon, authenticated;
grant select on public.v_places_to_tell to anon, authenticated;
grant insert on public.events to anon, authenticated;
