-- =============================================================================
-- 0018_idempotenza_pubblicazione.sql — Evita ritrovamenti duplicati da retry
--
-- Problema: se la risposta della RPC si perde (rete instabile), la coda offline
-- ripubblica la stessa memoria → il server crea un NUOVO POI con coordinate
-- offuscate diverse (random()). Risultato: la stessa foto appare in più punti.
--
-- Soluzione: il client passa un UUID generato una sola volta (client_key).
-- La RPC controlla se esiste già una contribution con quella chiave: se sì,
-- restituisce l'id esistente senza creare nulla.
-- =============================================================================

-- 1. Colonna per la chiave di idempotenza
alter table public.contributions
  add column if not exists client_key uuid;

create unique index if not exists contributions_client_key_idx
  on public.contributions(client_key) where client_key is not null;

-- 2. Ricreare la RPC con il parametro p_client_key
drop function if exists public.pubblica_ritrovamento(
  public.finding_type, text, double precision, double precision, public.contribution_kind,
  text, text, uuid, uuid, integer, boolean, boolean, boolean, boolean, boolean, integer
);

create or replace function public.pubblica_ritrovamento(
  p_finding_type   public.finding_type,
  p_name           text,
  p_lon            double precision,
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
  p_zone_radius_m  integer default 1000,
  p_client_key     uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_poi    uuid := p_poi_id;
  nuovo_id uuid;
  v_testo  integer;
  v_raggio integer := greatest(coalesce(p_zone_radius_m, 1000), 1000);
  v_centro geography;
begin
  -- Idempotenza: se la client_key esiste già, restituisce l'id esistente.
  if p_client_key is not null then
    select id into nuovo_id
    from public.contributions
    where client_key = p_client_key;
    if nuovo_id is not null then
      return nuovo_id;
    end if;
  end if;

  if not p_voce_propria and coalesce(p_permesso_terzi, false) is not true then
    raise exception 'Per pubblicare contenuti di un''altra persona serve il suo permesso'
      using errcode = 'check_violation';
  end if;
  if not coalesce(p_veridicita, false) then
    raise exception 'Serve la dichiarazione di veridicità'
      using errcode = 'check_violation';
  end if;

  if v_poi is null then
    v_centro := st_project(
      st_setsrid(st_point(p_lon, p_lat), 4326)::geography,
      random() * v_raggio * 0.35,
      random() * 2 * pi()
    );

    insert into public.pois (name, finding_type, event_year, geog, hazard_flag, route_id, zone_radius_m)
    values (
      coalesce(nullif(p_name, ''), 'Memoria'), p_finding_type, p_event_year,
      v_centro, coalesce(p_hazard_flag, false), p_route_id, v_raggio
    )
    returning id into v_poi;
  end if;

  insert into public.contributions (
    poi_id, kind, body, media_path, is_anonymous, voce_propria, permesso_terzi, client_key
  ) values (
    v_poi, p_kind, p_body, p_media_path, coalesce(p_is_anonymous, true),
    p_voce_propria, p_permesso_terzi, p_client_key
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
  text, text, uuid, uuid, integer, boolean, boolean, boolean, boolean, boolean, integer, uuid
) to authenticated;

notify pgrst, 'reload schema';
