-- =============================================================================
-- 0001_base.sql — Fondamenta dello schema Senti
--
-- Senti è una mappa mondiale dei RITROVAMENTI sul campo, appoggiata sulle grandi
-- rotte di guerra dei condottieri della storia. I percorsi principali sono già
-- tracciati (curati); gli utenti li arricchiscono con ritrovamenti, scegliendo
-- una CATEGORIA/icona (battaglia, munizioni, tesori, minerali, fossili, ...).
--
-- Contiene: estensioni, tabella profiles, funzioni helper (moderatore,
-- offuscamento deterministico delle coordinate), enum condivisi, e il trigger
-- che crea un profilo alla nascita di ogni utente (anche anonimo).
--
-- INVARIANTE: ogni tabella nasce con RLS attiva e policy esplicite nella stessa
-- migrazione.
-- =============================================================================

-- --- Estensioni --------------------------------------------------------------
create extension if not exists postgis;      -- geografia (Point 4326, distanze)
create extension if not exists vector;        -- embedding pgvector (1536)
create extension if not exists pgcrypto;      -- hashing deterministico

-- --- Enum condivisi ----------------------------------------------------------
-- Grado di certezza storica (usato da percorsi, segmenti e ritrovamenti).
create type public.certainty as enum ('attestato', 'probabile', 'ipotetico');

-- Stato di moderazione di un ritrovamento. I ritrovamenti sono PUBBLICI SUBITO:
-- nascono 'pubblicato'. La moderazione interviene solo dopo una segnalazione e
-- può portare a 'rimosso'. (Niente più coda di approvazione preventiva.)
create type public.contribution_status as enum ('pubblicato', 'rimosso');

-- Tipo di media di un ritrovamento. Niente audio: solo foto e testo.
create type public.contribution_kind as enum ('foto', 'testo');

-- CATEGORIA del ritrovamento = l'icona che l'utente sceglie per primo. È il
-- gesto centrale dell'app e guida mappa, filtri e campi mostrati.
--   battaglia      ⚔️  info e dettagli di uno scontro
--   munizioni      🔫  bossoli, palle di cannone, schegge
--   equipaggiamento🪖  armi, elmi, medaglie, divise
--   fortificazione 🏰  trincee, bunker, mura, postazioni
--   caduti         ⚰️  luoghi di sepoltura, memoriali di caduti
--   tesori         🗝️  monete, oro, ripostigli
--   minerali       💎  cristalli, ritrovamenti geologici
--   fossili        🦴  ossa, ammoniti, impronte
--   archeologico   🏺  ceramiche e resti antichi non militari
--   monumento      🏛️  cippi, targhe, memoriali
--   aneddoto       📜  racconti e leggende del luogo
--   foto_storica   📷  immagine storica con didascalia
create type public.finding_type as enum (
  'battaglia', 'munizioni', 'equipaggiamento', 'fortificazione', 'caduti',
  'tesori', 'minerali', 'fossili', 'archeologico', 'monumento',
  'aneddoto', 'foto_storica'
);

-- --- Tabella profiles --------------------------------------------------------
-- Un profilo per ogni utente di auth.users. `is_moderator` non è modificabile
-- dall'utente (vedi grant sotto): solo il seed o un admin via service_role può
-- promuovere un moderatore. (I percorsi li aggiunge lo sviluppatore via
-- migrazioni/seed, non un curatore dall'app: qui il ruolo serve solo a gestire
-- le segnalazioni.)
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_moderator boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- --- Funzioni helper ---------------------------------------------------------

-- Vero se l'utente indicato (default: utente corrente) è un moderatore.
-- SECURITY DEFINER: legge profiles scavalcando la RLS, così è usabile nelle policy.
create or replace function public.is_moderator(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_moderator from public.profiles p where p.id = uid), false);
$$;

-- Offuscamento DETERMINISTICO di un punto geografico.
-- Un ritrovamento sensibile (hazard_flag: es. un tesoro o un sito di scavo che
-- non va esposto) non rivela mai le coordinate esatte: viene proiettato di una
-- distanza e un azimut ricavati in modo stabile dall'id (stesso id -> stesso
-- spostamento, non un jitter casuale ad ogni lettura).
create or replace function public.obfuscate_geog(
  g        geography,
  seed     uuid,
  radius_m double precision default 300
)
returns geography
language sql
immutable
as $$
  -- Il prefisso '0' davanti a 7 hex azzera il bit di segno: il valore è sempre
  -- non negativo e deterministico rispetto a `seed`.
  select st_project(
    g,
    -- distanza in [0, radius_m]
    (('x' || '0' || substr(md5(seed::text), 1, 7))::bit(32)::int % (radius_m::int + 1))::double precision,
    -- azimut in radianti (0..359 gradi)
    radians((('x' || '0' || substr(md5(seed::text), 8, 7))::bit(32)::int % 360)::double precision)
  );
$$;

-- --- Trigger: profilo automatico alla creazione di un utente -----------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- RLS policies su profiles ------------------------------------------------
-- Lettura/aggiornamento solo del proprio profilo. Nessun insert dal client
-- (ci pensa il trigger). La lettura pubblica NON passa da qui: l'identità non
-- si espone mai direttamente.
create policy profiles_select_own
  on public.profiles for select
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- Grants ------------------------------------------------------------------
-- L'utente (anche anonimo) opera con il ruolo `authenticated`. La RLS filtra
-- le righe; qui si concedono i privilegi di base. `is_moderator` è escluso
-- dall'update per impedire l'auto-promozione a moderatore.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
