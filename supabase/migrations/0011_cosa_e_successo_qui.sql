-- =============================================================================
-- 0011_cosa_e_successo_qui.sql — La colonna del tempo di un luogo
--
-- Data una posizione, si compone un unico elenco cronologico: gli eventi delle
-- campagne (entro un raggio che scala con l'importanza dell'evento) e le
-- memorie degli utenti. La distanza degli eventi è calcolata sulla LINEA del
-- percorso, non su un punto, e si riporta la posizione in km lungo il tracciato.
--
-- Due aggiunte allo schema:
--  - route_segments.importance: un evento importante si vede da più lontano.
--  - contributions.event_year: l'anno dell'episodio ricordato (dichiarato dal
--    narratore), che permette di collocare la memoria sulla linea del tempo.
--    È diverso da created_at (quando è stata registrata).
-- =============================================================================

alter table public.route_segments
  add column importance smallint not null default 1
  check (importance between 1 and 5);

alter table public.contributions
  add column event_year integer
  check (event_year is null or event_year between 1000 and extract(year from now())::int + 1);

-- L'anno dell'evento è un dato pubblico utile: lo aggiungo alla vista.
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
  c.narrator_birth_year,
  c.text_source,
  c.audio_duration_ms,
  c.event_year
from public.contributions c
left join public.anon_aliases a on a.author_id = c.author_id
left join public.profiles pr on pr.id = c.author_id
where c.status = 'approvato'
  and c.narrator_consent = true;

-- Anche v_route_segments_public espone l'importanza e il geom (serve per la
-- distanza alla linea).
create or replace view public.v_route_segments_public as
select
  s.id,
  s.route_id,
  s.seq,
  s.certainty,
  s.date_from,
  s.date_to,
  s.sources,
  st_asgeojson(s.geom)::jsonb as geojson,
  s.importance
from public.route_segments s;

-- =============================================================================
-- RPC: la colonna del tempo
--
-- Non è SECURITY DEFINER: legge solo dalle viste/tabelle pubbliche, quindi
-- l'anonimato è garantito dallo stesso meccanismo di sempre (author_id non
-- esiste in v_contributions_public). Il raggio base è in metri.
-- =============================================================================
create or replace function public.cosa_e_successo_qui(
  p_lon         double precision,
  p_lat         double precision,
  p_raggio_base double precision default 500
)
returns table (
  tipo         text,        -- 'campagna' | 'memoria'
  id           uuid,
  titolo       text,
  sottotitolo  text,        -- attore della campagna / nome del narratore
  anno         integer,     -- anno dell'evento, per l'ordinamento cronologico
  certezza     text,        -- solo per le campagne
  testo        text,
  media_path   text,        -- solo per le memorie audio
  text_source  text,        -- origine del testo (per le memorie)
  distanza_m   double precision,  -- distanza dalla linea (campagne) o dal punto (memorie)
  chainage_m   double precision   -- posizione lungo il tracciato, se applicabile
)
language sql
stable
as $$
  with punto as (
    select st_setsrid(st_point(p_lon, p_lat), 4326)::geography as g,
           st_setsrid(st_point(p_lon, p_lat), 4326)           as geom
  )
  -- Eventi delle campagne: il raggio scala con l'importanza.
  select
    'campagna'::text,
    s.id,
    r.title,
    r.actor,
    extract(year from s.date_from)::int as anno,
    s.certainty::text,
    (select string_agg(coalesce(x->>'cit', ''), ' · ')
       from jsonb_array_elements(s.sources) x)              as testo,
    null::text as media_path,
    null::text as text_source,
    st_distance(s.geom::geography, punto.g)                 as distanza_m,
    st_linelocatepoint(r.geom, punto.geom) * st_length(r.geom::geography) as chainage_m
  from public.route_segments s
  join public.routes r on r.id = s.route_id
  cross join punto
  where st_dwithin(s.geom::geography, punto.g, p_raggio_base * s.importance)

  union all

  -- Memorie degli utenti: raggio fisso (sono personali, di scala minuta).
  select
    'memoria'::text,
    c.id,
    coalesce(v.name, 'Luogo'),
    c.narrator_name,
    c.event_year,
    null::text as certezza,
    coalesce(c.transcript, c.body)                          as testo,
    c.media_path,
    c.text_source::text,
    st_distance(
      st_setsrid(st_point(v.lon, v.lat), 4326)::geography,
      punto.g
    )                                                       as distanza_m,
    null::double precision as chainage_m
  from public.v_contributions_public c
  join public.v_pois_public v on v.id = c.poi_id
  cross join punto
  where st_dwithin(
    st_setsrid(st_point(v.lon, v.lat), 4326)::geography,
    punto.g,
    p_raggio_base
  )

  -- Cronologico: prima ciò che ha una data, dal più antico. Le memorie senza
  -- anno indicato vanno in fondo (ordinate per vicinanza).
  order by anno asc nulls last, distanza_m asc;
$$;

grant execute on function public.cosa_e_successo_qui(double precision, double precision, double precision)
  to anon, authenticated;
