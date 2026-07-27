-- =============================================================================
-- 0014_zona_memoria.sql — Le memorie utente sono ZONE, mai punti esatti
--
-- La memoria non salva mai il punto preciso: il client calcola un centro con un
-- piccolo scostamento casuale e invia SOLO quel centro + un RAGGIO (1/3/5 km).
-- Sulla mappa la memoria si mostra come cerchio ampio, non come pin sul luogo.
--
-- Non tocca le campagne storiche (empires/commanders/routes/battles).
-- =============================================================================

alter table public.pois add column if not exists zone_radius_m integer;

-- La vista pubblica espone anche il raggio della zona (in coda).
create or replace view public.v_pois_public as
select
  p.id,
  p.name,
  p.description,
  p.finding_type,
  p.certainty,
  p.event_year,
  p.hazard_flag,
  g.geog,
  st_y(g.geog::geometry) as lat,
  st_x(g.geog::geometry) as lon,
  p.created_at,
  p.zone_radius_m
from public.pois p
cross join lateral (
  select case
           when p.hazard_flag then public.obfuscate_geog(p.geog, p.id)
           else p.geog
         end as geog
) g;

-- --- RPC pubblica_ritrovamento: aggiunge il raggio della zona ----------------
-- Firma cambiata (nuovo parametro) → DROP + CREATE.
drop function if exists public.pubblica_ritrovamento(
  public.finding_type, text, double precision, double precision, public.contribution_kind,
  text, text, uuid, uuid, integer, boolean, boolean, boolean, boolean, boolean
);

create or replace function public.pubblica_ritrovamento(
  p_finding_type   public.finding_type,
  p_name           text,
  p_lon            double precision,   -- centro GIÀ scostato dal client (mai il punto esatto)
  p_lat            double precision,
  p_kind           public.contribution_kind,
  p_body           text default null,
  p_media_path     text default null,
  p_poi_id         uuid default null,
  p_route_id       uuid default null,
  p_event_year     integer default null,
  p_hazard_flag    boolean default false,
  p_is_anonymous   boolean default true,
  p_voce_propria   boolean default true,
  p_permesso_terzi boolean default null,
  p_veridicita     boolean default false,
  p_zone_radius_m  integer default 1000
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_poi   uuid := p_poi_id;
  nuovo_id uuid;
  v_testo  integer;
begin
  if not p_voce_propria and coalesce(p_permesso_terzi, false) is not true then
    raise exception 'Per pubblicare contenuti di un''altra persona serve il suo permesso'
      using errcode = 'check_violation';
  end if;
  if not coalesce(p_veridicita, false) then
    raise exception 'Serve la dichiarazione di veridicità'
      using errcode = 'check_violation';
  end if;

  if v_poi is null then
    insert into public.pois (name, finding_type, event_year, geog, hazard_flag, route_id, zone_radius_m)
    values (
      coalesce(nullif(p_name, ''), 'Memoria'), p_finding_type, p_event_year,
      st_setsrid(st_point(p_lon, p_lat), 4326)::geography, coalesce(p_hazard_flag, false),
      p_route_id, greatest(coalesce(p_zone_radius_m, 1000), 1000)
    )
    returning id into v_poi;
  end if;

  insert into public.contributions (
    poi_id, kind, body, media_path, is_anonymous, voce_propria, permesso_terzi
  ) values (
    v_poi, p_kind, p_body, p_media_path, coalesce(p_is_anonymous, true), p_voce_propria, p_permesso_terzi
  )
  returning id into nuovo_id;

  select versione into v_testo from public.legal_texts where tipo = 'dichiarazione' and attivo;

  insert into public.contribution_declarations (
    contribution_id, user_id, voce_propria, permesso_terzi, veridicita, versione_testo
  ) values (
    nuovo_id, auth.uid(), p_voce_propria, p_permesso_terzi, coalesce(p_veridicita, false), coalesce(v_testo, 1)
  );

  return nuovo_id;
end;
$$;

grant execute on function public.pubblica_ritrovamento(
  public.finding_type, text, double precision, double precision, public.contribution_kind,
  text, text, uuid, uuid, integer, boolean, boolean, boolean, boolean, boolean, integer
) to authenticated;
