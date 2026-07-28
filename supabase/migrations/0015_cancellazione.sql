-- =============================================================================
-- 0015_cancellazione.sql — Cancellazione con avviso di 5 giorni
--
-- "Cancella" NON rimuove subito: segna il momento della richiesta. Per 5 giorni
-- il contenuto resta visibile con l'avviso "sarà cancellata fra N giorni"; dopo
-- 5 giorni sparisce dalle viste pubbliche (soft delete). Solo memorie utente.
--
-- NB: per la fase di test la richiesta è aperta a ogni utente autenticato.
-- In amministrazione futura andrà ristretta ad autore/moderatore.
-- =============================================================================

alter table public.pois add column if not exists delete_requested_at timestamptz;

-- v_pois_public: espone delete_requested_at e nasconde le memorie dopo 5 giorni.
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
  p.zone_radius_m,
  p.delete_requested_at
from public.pois p
cross join lateral (
  select case
           when p.hazard_flag then public.obfuscate_geog(p.geog, p.id)
           else p.geog
         end as geog
) g
where p.delete_requested_at is null
   or p.delete_requested_at > now() - interval '5 days';

-- --- Richiesta di cancellazione (avvia il conto alla rovescia di 5 giorni) ----
create or replace function public.richiedi_cancellazione(p_poi_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Serve una sessione per cancellare';
  end if;
  -- Non resetta il timer se già avviato.
  update public.pois
     set delete_requested_at = now()
   where id = p_poi_id and delete_requested_at is null;
end;
$$;
grant execute on function public.richiedi_cancellazione(uuid) to authenticated;

-- --- "Cosa è successo qui": aggiunge poi_id e la data di cancellazione --------
-- Cambia il tipo di ritorno → DROP + CREATE.
drop function if exists public.cosa_e_successo_qui(double precision, double precision, double precision);

create function public.cosa_e_successo_qui(
  p_lon         double precision,
  p_lat         double precision,
  p_raggio_base double precision default 500
)
returns table (
  tipo             text,
  id               uuid,
  titolo           text,
  sottotitolo      text,
  anno             integer,
  certezza         text,
  testo            text,
  finding_type     text,
  media_path       text,
  distanza_m       double precision,
  chainage_m       double precision,
  poi_id           uuid,          -- per le memorie: id del pin (per la cancellazione)
  cancellazione_il timestamptz    -- se impostata, sarà cancellata dopo 5 giorni
)
language sql
stable
as $$
  with punto as (
    select st_setsrid(st_point(p_lon, p_lat), 4326)::geography as g,
           st_setsrid(st_point(p_lon, p_lat), 4326)           as geom
  )
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
    st_linelocatepoint(r.geom, punto.geom) * st_length(r.geom::geography) as chainage_m,
    null::uuid as poi_id,
    null::timestamptz as cancellazione_il
  from public.route_segments s
  join public.routes r on r.id = s.route_id
  left join public.commanders cm on cm.id = r.commander_id
  cross join punto
  where st_dwithin(s.geom::geography, punto.g, p_raggio_base * s.importance)

  union all

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
    null::double precision as chainage_m,
    v.id as poi_id,
    v.delete_requested_at as cancellazione_il
  from public.v_contributions_public c
  join public.v_pois_public v on v.id = c.poi_id
  cross join punto
  where st_dwithin(v.geog, punto.g, p_raggio_base)

  order by anno asc nulls last, distanza_m asc;
$$;

grant execute on function public.cosa_e_successo_qui(double precision, double precision, double precision)
  to anon, authenticated;

-- Ricarica la schema cache di PostgREST (funzione nuova vista subito).
notify pgrst, 'reload schema';
