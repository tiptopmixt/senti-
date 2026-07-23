-- =============================================================================
-- 0005_routes.sql — Percorsi (campagne e sentieri)
--
-- routes: tracciato con lunghezza generata. route_segments: tratti con grado di
-- certezza e fonti. I contributi si agganciano al percorso (route_id) con la
-- posizione lungo il tracciato (chainage_m) calcolata con ST_LineLocatePoint.
--
-- INVARIANTE certezza: un segmento è 'attestato' solo se ha almeno una fonte.
-- Gli import (Wikidata/OSM) nascono 'ipotetico'.
-- =============================================================================

create type public.route_kind as enum ('campagna', 'sentiero');

-- --- routes ------------------------------------------------------------------
-- geom è geometry(LineString) 4326: serve a ST_LineLocatePoint. La lunghezza in
-- metri è una colonna generata (calcolo geografico sullo spheroide).
create table public.routes (
  id         uuid primary key default gen_random_uuid(),
  kind       public.route_kind not null,
  title      text not null,
  actor      text,                              -- es. "Napoleone", "CAI 778"
  geom       geometry(LineString, 4326) not null,
  length_m   double precision generated always as (st_length(geom::geography)) stored,
  source_ref text,                              -- provenienza import (wikidata/osm id)
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index routes_geom_idx on public.routes using gist (geom);
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
  sources    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint route_segments_seq_unique unique (route_id, seq),
  -- 'attestato' richiede almeno una fonte allegata.
  constraint route_segments_attestato_needs_source
    check (certainty <> 'attestato' or jsonb_array_length(sources) > 0)
);
create index route_segments_route_idx on public.route_segments (route_id);
create index route_segments_geom_idx on public.route_segments using gist (geom);
alter table public.route_segments enable row level security;

-- --- contributions: aggancio al percorso -------------------------------------
alter table public.contributions
  add column route_id    uuid references public.routes (id) on delete set null,
  add column chainage_m  double precision;

-- Calcola la posizione del contributo lungo il tracciato (metri dall'inizio),
-- usando il POI del contributo come punto. SECURITY DEFINER per leggere
-- routes/pois scavalcando la RLS.
create or replace function public.set_contribution_chainage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_geom geometry;
  p_geog geography;
begin
  if new.route_id is not null and new.poi_id is not null then
    select geom into r_geom from public.routes where id = new.route_id;
    select geog into p_geog from public.pois where id = new.poi_id;
    if r_geom is not null and p_geog is not null then
      new.chainage_m := st_linelocatepoint(r_geom, p_geog::geometry) * st_length(r_geom::geography);
    else
      new.chainage_m := null;
    end if;
  else
    new.chainage_m := null;
  end if;
  return new;
end;
$$;

create trigger contributions_set_chainage
  before insert or update on public.contributions
  for each row execute function public.set_contribution_chainage();

-- =============================================================================
-- RLS policies
-- =============================================================================

-- routes: lettura diretta al creatore/curatore; il pubblico usa la vista.
create policy routes_select_own on public.routes for select
  using (created_by = auth.uid() or public.is_curator());
create policy routes_curator_write on public.routes for all
  using (public.is_curator())
  with check (public.is_curator());

-- route_segments: lettura pubblica (nessun dato personale); scrittura curatori.
create policy route_segments_select_all on public.route_segments for select
  using (true);
create policy route_segments_curator_write on public.route_segments for all
  using (public.is_curator())
  with check (public.is_curator());

-- =============================================================================
-- Viste pubbliche (senza created_by)
-- =============================================================================
create view public.v_routes_public as
select
  r.id,
  r.kind,
  r.title,
  r.actor,
  r.geom,
  r.length_m,
  r.created_at
from public.routes r;

-- =============================================================================
-- Grants
-- =============================================================================
grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.route_segments to authenticated;
grant select on public.v_routes_public to anon, authenticated;
grant select on public.route_segments to anon, authenticated;
