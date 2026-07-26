-- =============================================================================
-- 0008_dashboard.sql — Il registro reso visibile (dashboard /io)
--
-- Il registro è la promessa dell'app: trasparente e incancellabile. Solo
-- aggregati del titolare — mai chi ha votato o visitato.
--
-- Le visite si contano con deduplica per giorno e un hash di sessione. NESSUN IP
-- viene toccato. Il salt si rinnova ogni notte: le visite di uno stesso utente
-- non sono correlabili da un giorno all'altro.
-- =============================================================================

-- --- Salt giornaliero --------------------------------------------------------
create table public.view_salts (
  giorno date primary key default current_date,
  salt   text not null
);
alter table public.view_salts enable row level security;  -- nessun accesso dal client

create or replace function public.salt_del_giorno()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s text;
begin
  select salt into s from public.view_salts where giorno = current_date;
  if s is null then
    s := encode(gen_random_bytes(16), 'hex');
    insert into public.view_salts (giorno, salt) values (current_date, s)
    on conflict (giorno) do nothing;
    select salt into s from public.view_salts where giorno = current_date;
  end if;
  return s;
end;
$$;

-- --- Registro delle visite ---------------------------------------------------
create table public.poi_views (
  id           uuid primary key default gen_random_uuid(),
  poi_id       uuid not null references public.pois (id) on delete cascade,
  giorno       date not null default current_date,
  session_hash text not null,
  created_at   timestamptz not null default now(),
  constraint poi_views_dedup unique (poi_id, giorno, session_hash)
);
create index poi_views_poi_idx on public.poi_views (poi_id);
alter table public.poi_views enable row level security;  -- nessun accesso diretto dal client

create or replace function public.registra_visita(p_poi_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare h text;
begin
  if auth.uid() is null then return; end if;
  h := encode(digest(auth.uid()::text || '|' || public.salt_del_giorno(), 'sha256'), 'hex');
  insert into public.poi_views (poi_id, session_hash) values (p_poi_id, h)
  on conflict (poi_id, giorno, session_hash) do nothing;
end;
$$;

create materialized view public.mv_poi_view_counts as
select poi_id, count(*)::int as visite from public.poi_views group by poi_id;
create unique index mv_poi_view_counts_idx on public.mv_poi_view_counts (poi_id);

-- =============================================================================
-- RPC: la dashboard personale (solo numeri del titolare)
-- =============================================================================
create or replace function public.my_dashboard(
  p_lon double precision default null, p_lat double precision default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  uid          uuid := auth.uid();
  n_contributi int; n_pois int; n_reazioni int; n_visite int;
  n_citazioni  int; n_unica_voce int; punti int; punti_totali int;
  vicino jsonb;
begin
  if uid is null then
    return jsonb_build_object('anonimo', true);
  end if;

  select count(*) into n_contributi
    from public.contributions where author_id = uid and status = 'pubblicato';
  select count(*) into n_pois from public.pois where author_id = uid;
  select count(*) into n_reazioni
    from public.post_votes v join public.contributions c on c.id = v.contribution_id
   where c.author_id = uid;
  select count(*) into n_visite
    from public.poi_views pv join public.pois p on p.id = pv.poi_id where p.author_id = uid;
  select count(*) into n_citazioni
    from public.poi_narratives n, jsonb_array_elements(n.sources) s
    join public.contributions c on c.id = (s->>'contribution_id')::uuid
   where c.author_id = uid;
  select count(*) into n_unica_voce from (
    select c.poi_id from public.contributions c
     where c.status = 'pubblicato' and c.poi_id is not null
     group by c.poi_id having bool_and(c.author_id = uid)
  ) x;
  select coalesce(sum(delta), 0) into punti from public.points_ledger where user_id = uid;
  select coalesce(sum(delta), 0) into punti_totali from public.points_ledger;

  -- Stato vuoto: la campagna più vicina da esplorare (se note le coordinate).
  if n_contributi = 0 then
    select to_jsonb(t) into vicino from (
      select r.id, r.title,
             cm.name as condottiero
        from public.routes r
        left join public.commanders cm on cm.id = r.commander_id
       order by case when p_lon is null or p_lat is null then 0
                     else st_distance(r.geom::geography, st_setsrid(st_point(p_lon, p_lat), 4326)::geography)
                end asc
       limit 1
    ) t;
  end if;

  return jsonb_build_object(
    'anonimo', false,
    'citazioni', n_citazioni,
    'luoghi_unica_voce', n_unica_voce,
    'punti', punti,
    'quota_percento', case when punti_totali > 0 then round(100.0 * punti / punti_totali, 1) else 0 end,
    'pois', n_pois,
    'contributi', n_contributi,
    'reazioni', n_reazioni,
    'visite', n_visite,
    'campagna_da_esplorare_vicino', vicino
  );
end;
$$;

grant execute on function public.registra_visita(uuid) to authenticated;
grant execute on function public.my_dashboard(double precision, double precision) to authenticated;
