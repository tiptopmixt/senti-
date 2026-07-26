-- =============================================================================
-- 0006_consensi.sql — Consensi, informative, responsabilità, contesto storico
--
-- Due livelli separati:
--  A) Termini/Privacy/Cookie: si accettano UNA volta, per user_id + versione. Se
--     il testo cambia versione, chi aveva accettato la precedente va reinformato.
--  B) Dichiarazione sul singolo contenuto (voce propria / permesso di terzi /
--     veridicità): a OGNI pubblicazione, salvata davvero (append-only). Con
--     "online subito" è la prova della RESPONSABILITÀ di chi pubblica.
--
-- Tutti i testi legali qui sono SEGNAPOSTO: verranno forniti dopo. L'avviso
-- "app fatta con l'IA, può contenere errori" è nell'intro e nel footer (UI).
-- =============================================================================

-- --- A) Testi legali versionati ---------------------------------------------
create type public.legal_kind as enum ('termini', 'privacy', 'cookie', 'dichiarazione');

create table public.legal_texts (
  id        uuid primary key default gen_random_uuid(),
  tipo      public.legal_kind not null,
  versione  integer not null,
  titolo    text not null,
  corpo     text not null,
  attivo    boolean not null default true,
  creato_il timestamptz not null default now(),
  constraint legal_texts_tipo_versione unique (tipo, versione)
);
create unique index legal_texts_una_attiva on public.legal_texts (tipo) where attivo;
alter table public.legal_texts enable row level security;

create policy legal_texts_select_all on public.legal_texts for select using (true);
create policy legal_texts_mod_write on public.legal_texts for all
  using (public.is_moderator()) with check (public.is_moderator());
grant select on public.legal_texts to anon, authenticated;

insert into public.legal_texts (tipo, versione, titolo, corpo) values
  ('termini', 1, 'Termini d''uso',
   '[SEGNAPOSTO — Termini d''uso]

Senti è una mappa collaborativa di ritrovamenti storici e naturali. Ogni utente è responsabile in prima persona della verità e della liceità di ciò che pubblica (testi, foto, posizioni). La piattaforma non garantisce l''esattezza storica dei contenuti e non risponde di pubblicazioni fatte senza il permesso delle persone o dei proprietari coinvolti. Chi pubblica contenuti falsi, illeciti o altrui senza permesso ne risponde personalmente.

(Il testo legale definitivo verrà inserito qui.)'),
  ('privacy', 1, 'Informativa privacy',
   '[SEGNAPOSTO — Informativa privacy]

Senti nasce anonima: nessuna email, nessun nome, zero dati sensibili. Questa informativa spiega quali dati tecnici raccogliamo e perché.

(Il testo legale definitivo verrà inserito qui.)'),
  ('cookie', 1, 'Cookie',
   '[SEGNAPOSTO — Informativa cookie]

Usiamo cookie tecnici necessari al funzionamento (sempre attivi) e, solo se li accetti, cookie di statistica per capire come viene usata l''app. Puoi cambiare idea quando vuoi dalle impostazioni.

(Il testo legale definitivo verrà inserito qui.)'),
  ('dichiarazione', 1, 'Dichiarazione di pubblicazione',
   '[SEGNAPOSTO — Testo delle dichiarazioni al momento della pubblicazione]');

-- --- Accettazioni dell'utente ------------------------------------------------
create table public.user_acceptances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  tipo         public.legal_kind not null,
  versione     integer not null,
  dettaglio    jsonb not null default '{}'::jsonb,
  accettato_il timestamptz not null default now()
);
create index user_acceptances_user_idx on public.user_acceptances (user_id, tipo);
alter table public.user_acceptances enable row level security;

create policy user_acceptances_select_own on public.user_acceptances for select
  using (user_id = auth.uid());
create policy user_acceptances_insert_own on public.user_acceptances for insert
  with check (user_id = auth.uid());
grant select, insert on public.user_acceptances to authenticated;

create or replace function public.accetta_documento(
  p_tipo public.legal_kind, p_versione integer, p_dettaglio jsonb default '{}'::jsonb
)
returns void language sql security invoker as $$
  insert into public.user_acceptances (user_id, tipo, versione, dettaglio)
  values (auth.uid(), p_tipo, p_versione, coalesce(p_dettaglio, '{}'::jsonb));
$$;
grant execute on function public.accetta_documento(public.legal_kind, integer, jsonb) to authenticated;

create or replace function public.stato_consensi()
returns jsonb language sql stable security invoker as $$
  select coalesce(jsonb_object_agg(t.tipo, jsonb_build_object(
           'versione_attiva', t.versione,
           'versione_accettata', a.versione,
           'da_mostrare', (a.versione is null or a.versione < t.versione),
           'dettaglio', a.dettaglio
         )), '{}'::jsonb)
  from public.legal_texts t
  left join lateral (
    select ua.versione, ua.dettaglio from public.user_acceptances ua
     where ua.user_id = auth.uid() and ua.tipo = t.tipo
     order by ua.accettato_il desc limit 1
  ) a on true
  where t.attivo and t.tipo in ('termini', 'privacy', 'cookie');
$$;
grant execute on function public.stato_consensi() to authenticated;

-- --- B) Dichiarazioni per-contenuto (la prova della responsabilità) ----------
create table public.contribution_declarations (
  id             uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  voce_propria   boolean not null,
  permesso_terzi boolean,
  veridicita     boolean not null,
  versione_testo integer not null,
  dichiarato_il  timestamptz not null default now()
);
create index contribution_declarations_contrib_idx on public.contribution_declarations (contribution_id);
alter table public.contribution_declarations enable row level security;

create policy contribution_declarations_select_own on public.contribution_declarations for select
  using (user_id = auth.uid() or public.is_moderator());
create policy contribution_declarations_insert_own on public.contribution_declarations for insert
  with check (user_id = auth.uid());
grant select, insert on public.contribution_declarations to authenticated;

create or replace function public.declarations_append_only()
returns trigger language plpgsql as $$
begin raise exception 'contribution_declarations è append-only'; end; $$;
create trigger contribution_declarations_no_update before update on public.contribution_declarations
  for each row execute function public.declarations_append_only();
create trigger contribution_declarations_no_delete before delete on public.contribution_declarations
  for each row execute function public.declarations_append_only();

-- Pubblica un ritrovamento in un'unica transazione: crea il pin (se serve),
-- il contenuto (foto/testo) e SALVA la dichiarazione di responsabilità.
--   - se non è voce propria, il permesso di terzi è obbligatorio;
--   - la veridicità è sempre obbligatoria.
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
  p_veridicita     boolean default false
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

  -- Crea il pin se non è stato indicato uno esistente.
  if v_poi is null then
    insert into public.pois (name, finding_type, event_year, geog, hazard_flag, route_id)
    values (
      coalesce(nullif(p_name, ''), 'Ritrovamento'), p_finding_type, p_event_year,
      st_setsrid(st_point(p_lon, p_lat), 4326)::geography, coalesce(p_hazard_flag, false), p_route_id
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
  text, text, uuid, uuid, integer, boolean, boolean, boolean, boolean, boolean
) to authenticated;

-- --- C) Contesto storico (aggiunta della piattaforma, sempre separata) -------
-- Scritto dalla Edge Function `context`. Non fa parte del ritrovamento: non dice
-- mai se il contenuto dell'utente è vero, cita una fonte, ed è mostrato a parte.
create table public.contribution_context (
  id             uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade unique,
  titolo         text not null default 'Contesto storico',
  corpo          text not null,
  fonte_nome     text,
  fonte_url      text,
  creato_il      timestamptz not null default now()
);
alter table public.contribution_context enable row level security;
create policy contribution_context_select_all on public.contribution_context for select using (true);
grant select on public.contribution_context to anon, authenticated;
