-- =============================================================================
-- 0010_geojson_views.sql — Geometrie in un formato che la mappa sappia leggere
--
-- Le viste esistenti espongono `geom` come geometria PostGIS: attraverso
-- l'API REST arriva come WKB esadecimale, inutilizzabile da MapLibre.
-- Qui si aggiunge la stessa geometria in GeoJSON.
--
-- La certezza resta un dato di prima classe: il client la usa per decidere
-- se disegnare la linea continua, tratteggiata o punteggiata.
-- =============================================================================

-- Percorsi: si aggiunge il GeoJSON in coda (CREATE OR REPLACE conserva le
-- colonne esistenti nello stesso ordine).
create or replace view public.v_routes_public as
select
  r.id,
  r.kind,
  r.title,
  r.actor,
  r.geom,
  r.length_m,
  r.created_at,
  st_asgeojson(r.geom)::jsonb as geojson
from public.routes r;

-- Segmenti: è qui che vive la certezza, quindi è la vista che disegna davvero
-- i percorsi sulla mappa. Nessun dato personale.
create view public.v_route_segments_public as
select
  s.id,
  s.route_id,
  s.seq,
  s.certainty,
  s.date_from,
  s.date_to,
  s.sources,
  st_asgeojson(s.geom)::jsonb as geojson
from public.route_segments s;

grant select on public.v_route_segments_public to anon, authenticated;

-- --- Luoghi vicini a un punto -------------------------------------------------
-- Prima di salvare un nuovo luogo bisogna chiedere "intendevi X?": senza questo
-- controllo la mappa si riempie di doppioni dello stesso posto.
-- Le coordinate restituite sono quelle PUBBLICHE: un POI sensibile resta
-- offuscato anche qui.
create or replace function public.luoghi_vicini(
  p_lon    double precision,
  p_lat    double precision,
  p_raggio double precision default 100
)
returns table (
  id          uuid,
  name        text,
  lat         double precision,
  lon         double precision,
  distanza_m  double precision
)
language sql
stable
as $$
  select
    v.id,
    v.name,
    v.lat,
    v.lon,
    st_distance(
      v.geog,
      st_setsrid(st_point(p_lon, p_lat), 4326)::geography
    ) as distanza_m
  from public.v_pois_public v
  where st_dwithin(
    v.geog,
    st_setsrid(st_point(p_lon, p_lat), 4326)::geography,
    p_raggio
  )
  order by distanza_m asc
  limit 10;
$$;

grant execute on function public.luoghi_vicini(double precision, double precision, double precision)
  to anon, authenticated;
