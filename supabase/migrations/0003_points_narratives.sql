-- =============================================================================
-- 0003_points_narratives.sql — Registro punti e narrazioni
--
-- points_ledger: append-only, scritto SOLO da trigger/RPC (mai dal client).
--   I punti nascono all'APPROVAZIONE del contributo, non alla pubblicazione.
-- poi_narratives: narrazioni unificate per luogo, versionate, con fonti.
-- =============================================================================

-- Motivo di una riga del registro punti.
create type public.point_reason as enum ('contributo_approvato', 'aggiustamento');

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

-- Append-only: UPDATE e DELETE sono vietati a CHIUNQUE (anche al proprietario
-- e alla service_role). Le correzioni si fanno con nuove righe ('aggiustamento').
create or replace function public.points_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'points_ledger è append-only: UPDATE/DELETE non consentiti';
end;
$$;

create trigger points_ledger_no_update
  before update on public.points_ledger
  for each row execute function public.points_ledger_append_only();

create trigger points_ledger_no_delete
  before delete on public.points_ledger
  for each row execute function public.points_ledger_append_only();

-- RLS: ognuno legge solo il proprio registro. Nessuna scrittura dal client
-- (nessuna policy di insert + nessun grant di insert): scrivono solo i trigger
-- SECURITY DEFINER e le RPC.
create policy points_ledger_select_own on public.points_ledger for select
  using (user_id = auth.uid());

-- --- Assegnazione punti all'approvazione -------------------------------------
-- Imposta approved_at nel momento in cui un contributo diventa 'approvato'.
create or replace function public.set_approved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approvato'
     and (tg_op = 'INSERT' or old.status is distinct from 'approvato')
     and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;

create trigger contributions_set_approved_at
  before insert or update on public.contributions
  for each row execute function public.set_approved_at();

-- Inserisce la riga di punti quando un contributo diventa 'approvato'.
-- SECURITY DEFINER: scrive nel ledger scavalcando RLS/grant del client.
create or replace function public.award_points_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approvato'
     and (tg_op = 'INSERT' or old.status is distinct from 'approvato')
     and new.author_id is not null then
    insert into public.points_ledger (user_id, delta, reason, contribution_id, poi_id)
    values (new.author_id, 10, 'contributo_approvato', new.id, new.poi_id);
  end if;
  return new;
end;
$$;

create trigger contributions_award_points
  after insert or update on public.contributions
  for each row execute function public.award_points_on_approval();

-- --- poi_narratives (versionate) ---------------------------------------------
-- Narrazione unificata di un luogo, prodotta dalla Edge Function `narrative`
-- (che gira con service_role). Versionata per lingua, con fonti citate e un
-- fingerprint delle fonti per la cache.
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

-- Gestione editoriale: solo curatori (la Edge Function usa service_role).
create policy poi_narratives_curator_all on public.poi_narratives for all
  using (public.is_curator())
  with check (public.is_curator());

-- Vista pubblica: l'ultima versione per (luogo, lingua).
create view public.v_poi_narratives_public as
select distinct on (poi_id, lang)
  id, poi_id, lang, version, body, sources, created_at
from public.poi_narratives
order by poi_id, lang, version desc;

-- =============================================================================
-- Grants
-- =============================================================================
-- Solo SELECT sul ledger: nessun insert/update/delete dal client.
grant select on public.points_ledger to authenticated;
grant select on public.poi_narratives to authenticated;
grant select on public.v_poi_narratives_public to anon, authenticated;
