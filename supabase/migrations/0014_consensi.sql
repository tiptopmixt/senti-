-- =============================================================================
-- 0014_consensi.sql — Consensi, informative, responsabilità
--
-- Due livelli separati:
--  A) Le cose che non cambiano (termini, privacy, cookie) si accettano UNA
--     volta, legate a user_id + data + VERSIONE. Se il testo cambia, chi aveva
--     accettato la versione precedente va reinformato: lo si ottiene
--     confrontando la versione attiva con quella accettata.
--  B) Le dichiarazioni sul singolo contenuto (voce propria / permesso di terzi
--     / veridicità) si registrano a OGNI pubblicazione, legate al contenuto.
--     Sono la prova specifica per quel contenuto: vengono salvate davvero.
--
-- Tutti i testi legali qui sono SEGNAPOSTO: verranno forniti dopo.
-- =============================================================================

-- --- A) Testi legali versionati ---------------------------------------------
create type public.legal_kind as enum ('termini', 'privacy', 'cookie', 'dichiarazione');

create table public.legal_texts (
  id        uuid primary key default gen_random_uuid(),
  tipo      public.legal_kind not null,
  versione  integer not null,
  titolo    text not null,
  corpo     text not null,                 -- SEGNAPOSTO
  attivo    boolean not null default true,
  creato_il timestamptz not null default now(),
  constraint legal_texts_tipo_versione unique (tipo, versione)
);
-- Una sola versione attiva per tipo.
create unique index legal_texts_una_attiva on public.legal_texts (tipo) where attivo;
alter table public.legal_texts enable row level security;

create policy legal_texts_select_all on public.legal_texts for select using (true);
create policy legal_texts_curator_write on public.legal_texts for all
  using (public.is_curator()) with check (public.is_curator());
grant select on public.legal_texts to anon, authenticated;

-- Testi segnaposto, versione 1.
insert into public.legal_texts (tipo, versione, titolo, corpo) values
  ('termini', 1, 'Termini d''uso',
   '[SEGNAPOSTO — Termini d''uso]

Senti raccoglie testimonianze personali. Ogni utente è responsabile della verità e della liceità di ciò che pubblica. La piattaforma non garantisce l''esattezza storica dei racconti. Chi pubblica contenuti falsi, o il racconto di un''altra persona senza il suo permesso, ne risponde in prima persona.

(Il testo legale definitivo verrà inserito qui.)'),
  ('privacy', 1, 'Informativa privacy',
   '[SEGNAPOSTO — Informativa privacy]

Questa è un''informativa da leggere, non un consenso da rifiutare. Spiega quali dati raccogliamo e perché.

(Il testo legale definitivo verrà inserito qui.)'),
  ('cookie', 1, 'Cookie',
   '[SEGNAPOSTO — Informativa cookie]

Usiamo cookie tecnici necessari al funzionamento (sempre attivi) e, solo se li accetti, cookie di statistica.

(Il testo legale definitivo verrà inserito qui.)'),
  ('dichiarazione', 1, 'Dichiarazione di pubblicazione',
   '[SEGNAPOSTO — Testo delle dichiarazioni al momento della pubblicazione]');

-- --- Accettazioni dell'utente ------------------------------------------------
-- Storia delle accettazioni: una riga per ogni accettazione. L'ultima per
-- (utente, tipo) è quella corrente. Il cookie può cambiare nel tempo (più righe).
create table public.user_acceptances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  tipo         public.legal_kind not null,
  versione     integer not null,
  dettaglio    jsonb not null default '{}'::jsonb,   -- es. cookie: {"statistiche": true}
  accettato_il timestamptz not null default now()
);
create index user_acceptances_user_idx on public.user_acceptances (user_id, tipo);
alter table public.user_acceptances enable row level security;

create policy user_acceptances_select_own on public.user_acceptances for select
  using (user_id = auth.uid());
create policy user_acceptances_insert_own on public.user_acceptances for insert
  with check (user_id = auth.uid());
grant select, insert on public.user_acceptances to authenticated;

-- Registra un'accettazione (o la scelta cookie, che può ripetersi nel tempo).
create or replace function public.accetta_documento(
  p_tipo      public.legal_kind,
  p_versione  integer,
  p_dettaglio jsonb default '{}'::jsonb
)
returns void
language sql
security invoker
as $$
  insert into public.user_acceptances (user_id, tipo, versione, dettaglio)
  values (auth.uid(), p_tipo, p_versione, coalesce(p_dettaglio, '{}'::jsonb));
$$;
grant execute on function public.accetta_documento(public.legal_kind, integer, jsonb) to authenticated;

-- Stato dell'onboarding: per ogni documento "da accettare una volta" dice qual è
-- la versione attiva e quella accettata dall'utente. Se attiva > accettata (o
-- mai accettata), va (ri)proposto.
create or replace function public.stato_consensi()
returns jsonb
language sql
stable
security invoker
as $$
  select coalesce(jsonb_object_agg(t.tipo, jsonb_build_object(
           'versione_attiva', t.versione,
           'versione_accettata', a.versione,
           'da_mostrare', (a.versione is null or a.versione < t.versione),
           'dettaglio', a.dettaglio
         )), '{}'::jsonb)
  from public.legal_texts t
  left join lateral (
    select ua.versione, ua.dettaglio
      from public.user_acceptances ua
     where ua.user_id = auth.uid() and ua.tipo = t.tipo
     order by ua.accettato_il desc
     limit 1
  ) a on true
  where t.attivo and t.tipo in ('termini', 'privacy', 'cookie');
$$;
grant execute on function public.stato_consensi() to authenticated;

-- --- B) Provenienza del contenuto + dichiarazioni per-contenuto --------------
-- Flag sul contributo, per moderazione e visualizzazione.
alter table public.contributions
  add column voce_propria   boolean,   -- true = la mia storia; false = di un'altra persona
  add column permesso_terzi boolean;   -- se non è mia, dichiaro di avere il permesso

-- La PROVA specifica per quel contenuto. Append-only: non si modifica né cancella.
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
  using (user_id = auth.uid() or public.is_curator());
create policy contribution_declarations_insert_own on public.contribution_declarations for insert
  with check (user_id = auth.uid());
grant select, insert on public.contribution_declarations to authenticated;

-- Append-only: niente UPDATE/DELETE, è una prova.
create or replace function public.declarations_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'contribution_declarations è append-only';
end; $$;
create trigger contribution_declarations_no_update
  before update on public.contribution_declarations
  for each row execute function public.declarations_append_only();
create trigger contribution_declarations_no_delete
  before delete on public.contribution_declarations
  for each row execute function public.declarations_append_only();

-- Pubblica una memoria E salva la dichiarazione, in un'unica transazione: la
-- prova viene registrata davvero, non solo mostrata.
--   - se non è voce propria, il permesso di terzi è obbligatorio;
--   - per l'audio, il consenso alla voce è obbligatorio (altrimenti resta bozza
--     privata lato client e questa funzione non viene chiamata).
create or replace function public.pubblica_memoria(
  p_kind                public.contribution_kind,
  p_poi_id              uuid,
  p_media_path          text,
  p_audio_duration_ms   integer,
  p_body                text,
  p_narrator_name       text,
  p_narrator_birth_year integer,
  p_event_year          integer,
  p_narrator_consent    boolean,
  p_is_anonymous        boolean,
  p_voce_propria        boolean,
  p_permesso_terzi      boolean,
  p_veridicita          boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  nuovo_id uuid;
  v_testo  integer;
begin
  if not p_voce_propria and coalesce(p_permesso_terzi, false) is not true then
    raise exception 'Per pubblicare la storia di un''altra persona serve il suo permesso'
      using errcode = 'check_violation';
  end if;
  if p_kind = 'audio' and coalesce(p_narrator_consent, false) is not true then
    raise exception 'Senza consenso alla voce l''audio non può essere pubblicato'
      using errcode = 'check_violation';
  end if;
  if not coalesce(p_veridicita, false) then
    raise exception 'Serve la dichiarazione di veridicità'
      using errcode = 'check_violation';
  end if;

  insert into public.contributions (
    author_id, collected_by, poi_id, kind, media_path, audio_duration_ms,
    body, narrator_name, narrator_birth_year, event_year, narrator_consent,
    is_anonymous, voce_propria, permesso_terzi
  ) values (
    auth.uid(), auth.uid(), p_poi_id, p_kind, p_media_path, p_audio_duration_ms,
    p_body, p_narrator_name, p_narrator_birth_year, p_event_year, p_narrator_consent,
    coalesce(p_is_anonymous, true), p_voce_propria, p_permesso_terzi
  )
  returning id into nuovo_id;

  select versione into v_testo from public.legal_texts
   where tipo = 'dichiarazione' and attivo;

  insert into public.contribution_declarations (
    contribution_id, user_id, voce_propria, permesso_terzi, veridicita, versione_testo
  ) values (
    nuovo_id, auth.uid(), p_voce_propria, p_permesso_terzi, p_veridicita, coalesce(v_testo, 1)
  );

  return nuovo_id;
end;
$$;
grant execute on function public.pubblica_memoria(
  public.contribution_kind, uuid, text, integer, text, text, integer, integer,
  boolean, boolean, boolean, boolean, boolean
) to authenticated;

-- --- C) Segnalazioni ---------------------------------------------------------
create type public.report_reason as enum (
  'falso_ingannevole',   -- contenuto falso o ingannevole
  'senza_permesso',      -- pubblicato senza permesso della persona coinvolta
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

-- Chiunque (autenticato) può segnalare; nessuno legge le segnalazioni dal client
-- (le vedono i curatori tramite la coda di moderazione).
create policy content_reports_insert_self on public.content_reports for insert
  with check (reporter_id = auth.uid());
grant insert on public.content_reports to authenticated;

-- Soglia di auto-revisione, modificabile senza migrazione.
insert into public.app_settings (chiave, valore, descrizione) values
  ('segnalazioni_per_revisione', 3,
   'Numero di segnalazioni oltre il quale un racconto approvato torna automaticamente in revisione.');

-- Un racconto molto segnalato torna in revisione da solo.
create or replace function public.auto_revisione_su_segnalazioni()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  soglia int;
begin
  select count(distinct reporter_id) into n
    from public.content_reports where contribution_id = new.contribution_id;
  soglia := coalesce(public.limite('segnalazioni_per_revisione'), 3);

  if n >= soglia then
    update public.contributions
       set status = 'in_attesa'
     where id = new.contribution_id and status = 'approvato';
  end if;
  return new;
end;
$$;
create trigger content_reports_auto_revisione
  after insert on public.content_reports
  for each row execute function public.auto_revisione_su_segnalazioni();

-- RPC di segnalazione. SECURITY DEFINER (l'ON CONFLICT dentro una funzione con
-- RLS fa fallire il WITH CHECK): la sicurezza è garantita forzando reporter_id
-- all'utente corrente, che non può quindi segnalare a nome di altri.
create or replace function public.segnala_contenuto(
  p_contribution_id uuid,
  p_motivo          public.report_reason,
  p_nota            text default null
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

-- --- D) Contesto storico (aggiunta della piattaforma, separata) --------------
-- Scritto dalla Edge Function `context`. Non è parte della testimonianza: non
-- dice mai se il racconto è vero o falso, cita una fonte, ed è sempre separato.
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
-- Contenuto della piattaforma, nessun dato personale: lettura pubblica.
create policy contribution_context_select_all on public.contribution_context for select using (true);
grant select on public.contribution_context to anon, authenticated;

-- --- Coda di moderazione: aggiungo il conteggio segnalazioni -----------------
-- Cambia il tipo di ritorno, quindi va ricreata (DROP + CREATE).
drop function if exists public.memorie_da_moderare();
create function public.memorie_da_moderare()
returns table (
  id                  uuid,
  poi_id              uuid,
  poi_nome            text,
  kind                public.contribution_kind,
  body                text,
  transcript          text,
  media_path          text,
  narrator_name       text,
  narrator_birth_year integer,
  event_year          integer,
  text_source         public.text_source,
  narrator_consent    boolean,
  voce_propria        boolean,
  permesso_terzi      boolean,
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
  if not public.is_curator(auth.uid()) then
    return;
  end if;

  return query
    select
      c.id, c.poi_id, p.name, c.kind, c.body, c.transcript, c.media_path,
      c.narrator_name, c.narrator_birth_year, c.event_year, c.text_source,
      c.narrator_consent, c.voce_propria, c.permesso_terzi,
      (select count(*)::int from public.content_reports r where r.contribution_id = c.id),
      (select string_agg(distinct r.motivo::text, ', ') from public.content_reports r where r.contribution_id = c.id),
      c.created_at
    from public.contributions c
    left join public.pois p on p.id = c.poi_id
    where c.status = 'in_attesa'
    order by
      (select count(*) from public.content_reports r where r.contribution_id = c.id) desc,
      c.created_at asc;
end;
$$;
grant execute on function public.memorie_da_moderare() to authenticated;
