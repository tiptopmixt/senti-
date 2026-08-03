-- =============================================================================
-- 0019_percorsi_nella_zona.sql — RPC per trovare percorsi storici nella zona
--
-- Dato un POI, cerca segmenti di percorsi storici che passano entro il raggio
-- della sua zona. Restituisce il nome del condottiero e del percorso.
-- Usato dall'assistente IA per aggiungere contesto geografico.
-- =============================================================================

create or replace function public.percorsi_nella_zona(
  p_poi_id  uuid,
  p_raggio  integer default 1000
)
returns table (
  route_id    uuid,
  nome        text
)
language sql
security invoker
set search_path = public
as $$
  select distinct
    rs.route_id,
    coalesce(cmd.name, r.title) as nome
  from public.pois p
  join public.route_segments rs
    on st_dwithin(p.geog, rs.geom::geography, greatest(p_raggio, p.zone_radius_m, 1000))
  join public.routes r on r.id = rs.route_id
  left join public.commanders cmd on cmd.id = r.commander_id
  where p.id = p_poi_id
  limit 5;
$$;

grant execute on function public.percorsi_nella_zona(uuid, integer)
  to authenticated, service_role;
