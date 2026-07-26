-- =============================================================================
-- 0004_punti_narrazioni.sql — Registro punti e narrazioni dei luoghi
--
-- points_ledger: append-only, scritto SOLO da trigger/RPC (mai dal client).
--   I punti nascono alla PUBBLICAZIONE del ritrovamento (online subito: non
--   esiste più un'approvazione preventiva).
-- poi_narratives: narrazione unificata di un luogo (Edge Function `narrative`).
-- =============================================================================

-- Motivo di una riga del registro punti.
create type public.point_reason as enum ('ritrovamento_pubblicato', 'aggiustamento');

-- --- points_ledger (append-only) ---------------------------------------------
create table public.points_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  delta           integer not null,
  reason          public.point_reason not null,
  contribution_id uuid references public.contributions (id) on delete set null,
  poi_id          uuid references public.pois (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index points_ledger_user_idx on public.points_ledger (user_id);
alter table public.points_ledger enable row level security;

-- Append-only: UPDATE e DELETE vietati a CHIUNQUE. Le correzioni si fanno con
-- nuove righe ('aggiustamento').
create or replace function public.points_ledger_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'points_ledger è append-only: UPDATE/DELETE non consentiti';
end;
$$;
create trigger points_ledger_no_update before update on public.points_ledger
  for each row execute function public.points_ledger_append_only();
create trigger points_ledger_no_delete before delete on public.points_ledger
  for each row execute function public.points_ledger_append_only();

-- RLS: ognuno legge solo il proprio registro. Nessuna scrittura dal client.
create policy points_ledger_select_own on public.points_ledger for select
  using (user_id = auth.uid());

-- --- Assegnazione punti alla PUBBLICAZIONE -----------------------------------
-- Un ritrovamento nasce 'pubblicato': i punti scattano all'inserimento (o quando
-- un contenuto rimosso viene ripubblicato). SECURITY DEFINER per scrivere nel
-- ledger scavalcando RLS/grant del client.
create or replace function public.award_points_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pubblicato'
     and (tg_op = 'INSERT' or old.status is distinct from 'pubblicato')
     and new.author_id is not null then
    insert into public.points_ledger (user_id, delta, reason, contribution_id, poi_id)
    values (new.author_id, 10, 'ritrovamento_pubblicato', new.id, new.poi_id);
  end if;
  return new;
end;
$$;
create trigger contributions_award_points
  after insert or update on public.contributions
  for each row execute function public.award_points_on_publish();

-- --- poi_narratives (versionate) ---------------------------------------------
-- Narrazione unificata di un luogo, prodotta dalla Edge Function `narrative`
-- (service_role). Unisce i ritrovamenti citando chi li ha aggiunti, senza
-- spacciarli per fatti attestati.
create table public.poi_narratives (
  id          uuid primary key default gen_random_uuid(),
  poi_id      uuid not null references public.pois (id) on delete cascade,
  lang        text not null default 'it',
  version     integer not null,
  body        text not null,
  sources     jsonb not null default '[]'::jsonb,
  fingerprint text,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint poi_narratives_version_unique unique (poi_id, lang, version)
);
create index poi_narratives_poi_idx on public.poi_narratives (poi_id);
alter table public.poi_narratives enable row level security;

create policy poi_narratives_mod_all on public.poi_narratives for all
  using (public.is_moderator()) with check (public.is_moderator());

create view public.v_poi_narratives_public as
select distinct on (poi_id, lang)
  id, poi_id, lang, version, body, sources, created_at
from public.poi_narratives
order by poi_id, lang, version desc;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.points_ledger to authenticated;
grant select on public.poi_narratives to authenticated;
grant select on public.v_poi_narratives_public to anon, authenticated;
