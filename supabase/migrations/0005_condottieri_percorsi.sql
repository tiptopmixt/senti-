-- =============================================================================
-- 0005_condottieri_percorsi.sql — Condottieri e campagne (i percorsi tracciati)
--
-- I percorsi principali sono già tracciati: li aggiunge lo sviluppatore via
-- migrazioni/seed (non un curatore dall'app). Ogni percorso appartiene a un
-- CONDOTTIERO/campagna (Napoleone, Cesare, Gengis Khan, ...). Gli utenti li
-- arricchiscono con i loro ritrovamenti (pois), agganciati al tracciato.
--
-- INVARIANTE certezza: un segmento è 'attestato' solo se ha almeno una fonte.
-- =============================================================================

create type public.route_kind as enum ('campagna', 'marcia', 'assedio');

-- --- commanders: i grandi condottieri / grandi guerre ------------------------
-- Dato di riferimento pubblico (nessun author_id). La biografia breve può avere
-- una fonte: è contesto storico, tenuto separato dai ritrovamenti degli utenti.
create table public.commanders (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- es. 'napoleone', 'gengis-khan'
  name        text not null,                 -- es. 'Napoleone Bonaparte'
  epoch       text,                          -- es. '1796–1797', 'XIII secolo'
  region      text,                          -- es. 'Italia settentrionale', 'Asia'
  bio         text,
  source_name text,
  source_url  text,
  created_at  timestamptz not null default now()
);
alter table public.commanders enable row level security;
create policy commanders_select_all on public.commanders for select using (true);
create policy commanders_mod_write on public.commanders for all
  using (public.is_moderator()) with check (public.is_moderator());

-- --- routes ------------------------------------------------------------------
create table public.routes (
  id           uuid primary key default gen_random_uuid(),
  commander_id uuid references public.commanders (id) on delete set null,
  kind         public.route_kind not null default 'campagna',
  title        text not null,
  geom         geometry(LineString, 4326) not null,
  length_m     double precision generated always as (st_length(geom::geography)) stored,
  source_ref   text,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index routes_geom_idx on public.routes using gist (geom);
create index routes_commander_idx on public.routes (commander_id);
alter table public.routes enable row level security;

-- --- route_segments ----------------------------------------------------------
create table public.route_segments (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes (id) on delete cascade,
  seq        integer not null,
  geom       geometry(LineString, 4326) not null,
  date_from  date,
  date_to    date,
  certainty  public.certainty not null default 'ipotetico',
  importance smallint not null default 1 check (importance between 1 and 5),
  sources    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint route_segments_seq_unique unique (route_id, seq),
  constraint route_segments_attestato_needs_source
    check (certainty <> 'attestato' or jsonb_array_length(sources) > 0)
);
create index route_segments_route_idx on public.route_segments (route_id);
create index route_segments_geom_idx on public.route_segments using gist (geom);
alter table public.route_segments enable row level security;

-- --- pois: aggancio al percorso ----------------------------------------------
alter table public.pois
  add column route_id   uuid references public.routes (id) on delete set null,
  add column chainage_m double precision;

-- Posizione del ritrovamento lungo il tracciato (metri dall'inizio).
create or replace function public.set_poi_chainage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_geom geometry;
begin
  if new.route_id is not null then
    select geom into r_geom from public.routes where id = new.route_id;
    if r_geom is not null then
      new.chainage_m := st_linelocatepoint(r_geom, new.geog::geometry) * st_length(r_geom::geography);
    else
      new.chainage_m := null;
    end if;
  else
    new.chainage_m := null;
  end if;
  return new;
end;
$$;
create trigger pois_set_chainage
  before insert or update on public.pois
  for each row execute function public.set_poi_chainage();

-- =============================================================================
-- RLS policies
-- =============================================================================
create policy routes_select_all on public.routes for select using (true);
create policy routes_mod_write on public.routes for all
  using (public.is_moderator()) with check (public.is_moderator());

create policy route_segments_select_all on public.route_segments for select using (true);
create policy route_segments_mod_write on public.route_segments for all
  using (public.is_moderator()) with check (public.is_moderator());

-- =============================================================================
-- Viste pubbliche (con GeoJSON per MapLibre)
-- =============================================================================
create view public.v_commanders_public as
select id, slug, name, epoch, region, bio, source_name, source_url from public.commanders;

create view public.v_routes_public as
select
  r.id, r.commander_id, r.kind, r.title, r.geom, r.length_m, r.created_at,
  st_asgeojson(r.geom)::jsonb as geojson
from public.routes r;

-- I segmenti portano la certezza (linea continua/tratteggiata/punteggiata).
create view public.v_route_segments_public as
select
  s.id, s.route_id, s.seq, s.certainty, s.date_from, s.date_to, s.sources,
  s.importance, st_asgeojson(s.geom)::jsonb as geojson
from public.route_segments s;

-- =============================================================================
-- RPC: "Cosa è successo qui" — la colonna del tempo di un luogo
--
-- Eventi delle campagne (raggio che scala con l'importanza) + ritrovamenti degli
-- utenti. Non SECURITY DEFINER: legge solo da viste pubbliche → anonimato intatto.
-- =============================================================================
create or replace function public.cosa_e_successo_qui(
  p_lon         double precision,
  p_lat         double precision,
  p_raggio_base double precision default 500
)
returns table (
  tipo         text,        -- 'campagna' | 'ritrovamento'
  id           uuid,
  titolo       text,
  sottotitolo  text,        -- condottiero (campagna) / categoria (ritrovamento)
  anno         integer,
  certezza     text,
  testo        text,
  finding_type text,        -- categoria/icona del ritrovamento
  media_path   text,
  distanza_m   double precision,
  chainage_m   double precision
)
language sql
stable
as $$
  with punto as (
    select st_setsrid(st_point(p_lon, p_lat), 4326)::geography as g,
           st_setsrid(st_point(p_lon, p_lat), 4326)           as geom
  )
  -- Eventi delle campagne.
  select
    'campagna'::text,
    s.id,
    r.title,
    cm.name,
    extract(year from s.date_from)::int as anno,
    s.certainty::text,
    (select string_agg(coalesce(x->>'cit', ''), ' · ')
       from jsonb_array_elements(s.sources) x) as testo,
    null::text as finding_type,
    null::text as media_path,
    st_distance(s.geom::geography, punto.g) as distanza_m,
    st_linelocatepoint(r.geom, punto.geom) * st_length(r.geom::geography) as chainage_m
  from public.route_segments s
  join public.routes r on r.id = s.route_id
  left join public.commanders cm on cm.id = r.commander_id
  cross join punto
  where st_dwithin(s.geom::geography, punto.g, p_raggio_base * s.importance)

  union all

  -- Ritrovamenti degli utenti.
  select
    'ritrovamento'::text,
    c.id,
    coalesce(v.name, 'Ritrovamento'),
    v.finding_type::text,
    v.event_year,
    v.certainty::text,
    c.body as testo,
    v.finding_type::text,
    c.media_path,
    st_distance(v.geog, punto.g) as distanza_m,
    null::double precision as chainage_m
  from public.v_contributions_public c
  join public.v_pois_public v on v.id = c.poi_id
  cross join punto
  where st_dwithin(v.geog, punto.g, p_raggio_base)

  order by anno asc nulls last, distanza_m asc;
$$;

-- --- Luoghi vicini a un punto (dedup prima di creare un nuovo pin) ------------
create or replace function public.luoghi_vicini(
  p_lon    double precision,
  p_lat    double precision,
  p_raggio double precision default 100
)
returns table (
  id uuid, name text, finding_type text,
  lat double precision, lon double precision, distanza_m double precision
)
language sql
stable
as $$
  select
    v.id, v.name, v.finding_type::text, v.lat, v.lon,
    st_distance(v.geog, st_setsrid(st_point(p_lon, p_lat), 4326)::geography) as distanza_m
  from public.v_pois_public v
  where st_dwithin(v.geog, st_setsrid(st_point(p_lon, p_lat), 4326)::geography, p_raggio)
  order by distanza_m asc
  limit 10;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.route_segments to authenticated;
grant select on public.commanders to anon, authenticated;
grant select on public.v_commanders_public to anon, authenticated;
grant select on public.v_routes_public to anon, authenticated;
grant select on public.v_route_segments_public to anon, authenticated;
grant execute on function public.cosa_e_successo_qui(double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.luoghi_vicini(double precision, double precision, double precision) to anon, authenticated;
