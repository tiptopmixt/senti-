-- =============================================================================
-- 0007_segnalazioni_moderazione.sql — Segnalazioni e moderazione a posteriori
--
-- I ritrovamenti sono PUBBLICI SUBITO. La moderazione interviene DOPO, su
-- segnalazione: chiunque può segnalare, i moderatori vedono la coda dei
-- contenuti segnalati e possono rimuoverli (status 'rimosso') o ripristinarli.
--
-- Anche il moderatore non vede author_id: modera il contenuto, non l'identità.
-- =============================================================================

create type public.report_reason as enum (
  'falso_ingannevole',   -- contenuto falso o ingannevole
  'senza_permesso',      -- pubblicato senza permesso della persona/proprietario
  'illecito',            -- scavo/detenzione non consentiti, luogo protetto
  'offensivo',
  'altro'
);

create table public.content_reports (
  id             uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  reporter_id    uuid references auth.users (id) on delete set null,
  motivo         public.report_reason not null,
  nota           text,
  creato_il      timestamptz not null default now(),
  constraint content_reports_una_per_motivo unique (contribution_id, reporter_id, motivo)
);
create index content_reports_contrib_idx on public.content_reports (contribution_id);
alter table public.content_reports enable row level security;

-- Chiunque (autenticato) segnala; nessuno legge le segnalazioni dal client.
create policy content_reports_insert_self on public.content_reports for insert
  with check (reporter_id = auth.uid());
grant insert on public.content_reports to authenticated;

-- RPC di segnalazione. SECURITY DEFINER: forza reporter_id all'utente corrente.
create or replace function public.segnala_contenuto(
  p_contribution_id uuid, p_motivo public.report_reason, p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Serve una sessione per segnalare';
  end if;
  insert into public.content_reports (contribution_id, reporter_id, motivo, nota)
  values (p_contribution_id, auth.uid(), p_motivo, p_nota)
  on conflict (contribution_id, reporter_id, motivo) do nothing;
end;
$$;
grant execute on function public.segnala_contenuto(uuid, public.report_reason, text) to authenticated;

-- --- Coda dei moderatori: solo i contenuti segnalati -------------------------
-- Ordina per numero di segnalazioni distinte (i più segnalati in cima).
create or replace function public.contenuti_segnalati()
returns table (
  id                  uuid,
  poi_id              uuid,
  poi_nome            text,
  finding_type        public.finding_type,
  kind                public.contribution_kind,
  body                text,
  media_path          text,
  status              public.contribution_status,
  event_year          integer,
  segnalazioni        integer,
  motivi_segnalazioni text,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator(auth.uid()) then
    return;
  end if;

  return query
    select
      c.id, c.poi_id, p.name, p.finding_type, c.kind, c.body, c.media_path,
      c.status, p.event_year,
      (select count(distinct r.reporter_id)::int from public.content_reports r where r.contribution_id = c.id),
      (select string_agg(distinct r.motivo::text, ', ') from public.content_reports r where r.contribution_id = c.id),
      c.created_at
    from public.contributions c
    left join public.pois p on p.id = c.poi_id
    where exists (select 1 from public.content_reports r where r.contribution_id = c.id)
    order by
      (select count(distinct r.reporter_id) from public.content_reports r where r.contribution_id = c.id) desc,
      c.created_at asc;
end;
$$;
grant execute on function public.contenuti_segnalati() to authenticated;

-- --- Azione del moderatore: rimuovi o ripristina -----------------------------
create or replace function public.modera_contenuto(p_id uuid, p_rimuovi boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator(auth.uid()) then
    raise exception 'Solo un moderatore può moderare i contenuti'
      using errcode = 'insufficient_privilege';
  end if;

  update public.contributions
     set status = case when p_rimuovi then 'rimosso'::public.contribution_status
                       else 'pubblicato'::public.contribution_status end
   where id = p_id;

  if not found then
    raise exception 'Contenuto non trovato';
  end if;
end;
$$;
grant execute on function public.modera_contenuto(uuid, boolean) to authenticated;
