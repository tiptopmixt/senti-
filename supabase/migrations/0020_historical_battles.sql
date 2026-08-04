-- =============================================================================
-- 0020_historical_battles.sql — Battaglie storiche europee (Wikidata)
--
-- Livello SEPARATO da campagne/condottieri e da ritrovamenti degli utenti.
-- Tutte nascono "da_verificare": nessuna è stata controllata da un curatore.
-- Importate da Wikidata con soglie differenziate per regione.
-- =============================================================================

create type public.battle_period as enum (
  'antichita',
  'medioevo',
  'eta_moderna',
  'napoleonico',
  'ottocento',
  'prima_guerra',
  'seconda_guerra',
  'contemporaneo'
);

create table public.historical_battles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_date    text,
  event_year    integer,
  period        public.battle_period not null,
  country       text not null,
  geog          geography(Point, 4326) not null,
  belligerents  text[],
  sitelinks     integer not null default 0,
  wikidata_id   text not null unique,
  wikipedia_url text,
  status        text not null default 'da_verificare',
  created_at    timestamptz not null default now()
);

create index historical_battles_geog_idx
  on public.historical_battles using gist (geog);
create index historical_battles_period_idx
  on public.historical_battles (period);
create index historical_battles_country_idx
  on public.historical_battles (country);
create index historical_battles_sitelinks_idx
  on public.historical_battles (sitelinks desc);

alter table public.historical_battles enable row level security;

create policy "Lettura pubblica battaglie storiche"
  on public.historical_battles for select using (true);

grant select on public.historical_battles to anon, authenticated;

-- Vista pubblica (estrae lat/lon dalla geografia, stessa convenzione di v_battles_public)
create or replace view public.v_historical_battles_public as
select
  hb.id,
  hb.name,
  hb.event_date,
  hb.event_year,
  hb.period,
  hb.country,
  st_y(hb.geog::geometry) as lat,
  st_x(hb.geog::geometry) as lon,
  hb.belligerents,
  hb.sitelinks,
  hb.wikidata_id,
  hb.wikipedia_url,
  hb.status
from public.historical_battles hb;

grant select on public.v_historical_battles_public to anon, authenticated;
