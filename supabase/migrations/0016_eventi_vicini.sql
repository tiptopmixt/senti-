-- =============================================================================
-- 0016_eventi_vicini.sql — Eventi storici vicini alla posizione
--
-- Restituisce gli EVENTI STORICI (battaglie + tappe delle campagne) più vicini a
-- un punto, ordinati per distanza. Il raggio scala con l'importanza: un evento
-- importante si vede da più lontano, uno minore solo se sei vicino.
--
-- SOLO eventi delle campagne (curati), MAI le memorie degli utenti.
-- =============================================================================

create or replace function public.eventi_vicini(
  p_lon         double precision,
  p_lat         double precision,
  p_raggio_base double precision default 50000   -- metri; il raggio reale = base * importanza
)
returns table (
  tipo         text,        -- 'battaglia' | 'tappa'
  id           uuid,
  commander_id uuid,
  titolo       text,
  schieramento text,        -- "Parte A ⚔ Parte B" (battaglia) o condottiero (tappa)
  anno         integer,
  importanza   smallint,
  distanza_m   double precision,
  lat          double precision,
  lon          double precision
)
language sql
stable
as $$
  with punto as (
    select st_setsrid(st_point(p_lon, p_lat), 4326)::geography as g,
           st_setsrid(st_point(p_lon, p_lat), 4326)           as geom
  )
  -- Battaglie: importanza alta fissa (si vedono da lontano).
  select
    'battaglia'::text,
    b.id,
    b.commander_id,
    b.name,
    coalesce(b.side_a || ' ⚔ ' || b.side_b, cm.name),
    b.year,
    5::smallint,
    st_distance(b.geog, punto.g),
    st_y(b.geog::geometry),
    st_x(b.geog::geometry)
  from public.battles b
  left join public.commanders cm on cm.id = b.commander_id
  cross join punto
  where st_dwithin(b.geog, punto.g, p_raggio_base * 5)

  union all

  -- Tappe delle campagne: raggio in base all'importanza del segmento.
  select
    'tappa'::text,
    s.id,
    r.commander_id,
    r.title,
    cm.name,
    extract(year from s.date_from)::int,
    s.importance,
    st_distance(s.geom::geography, punto.g),
    st_y(st_closestpoint(s.geom, punto.geom)),
    st_x(st_closestpoint(s.geom, punto.geom))
  from public.route_segments s
  join public.routes r on r.id = s.route_id
  left join public.commanders cm on cm.id = r.commander_id
  cross join punto
  where st_dwithin(s.geom::geography, punto.g, p_raggio_base * s.importance)

  order by distanza_m asc
  limit 40;
$$;

grant execute on function public.eventi_vicini(double precision, double precision, double precision)
  to anon, authenticated;

notify pgrst, 'reload schema';
