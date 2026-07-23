-- =============================================================================
-- 0001_base.sql — Fondamenta dello schema Senti
--
-- Contiene: estensioni, tabella profiles, funzioni helper (curatore,
-- offuscamento deterministico delle coordinate), enum condivisi, e il trigger
-- che crea un profilo alla nascita di ogni utente (anche anonimo).
--
-- INVARIANTE: ogni tabella nasce con RLS attiva e policy esplicite in questa
-- stessa migrazione.
-- =============================================================================

-- --- Estensioni --------------------------------------------------------------
create extension if not exists postgis;      -- geografia (Point 4326, distanze)
create extension if not exists vector;        -- embedding pgvector (1536)
create extension if not exists pgcrypto;      -- hashing deterministico

-- --- Enum condivisi ----------------------------------------------------------
-- Grado di certezza storica (usato da percorsi e narrazioni).
create type public.certainty as enum ('attestato', 'probabile', 'ipotetico');

-- Stato del flusso di moderazione dei contributi.
-- I punti nascono al passaggio ad 'approvato', non alla pubblicazione.
create type public.contribution_status as enum ('in_attesa', 'approvato', 'rifiutato');

-- Tipo di media di un contributo.
create type public.contribution_kind as enum ('foto', 'audio', 'testo');

-- --- Tabella profiles --------------------------------------------------------
-- Un profilo per ogni utente di auth.users. `is_curator` non è modificabile
-- dall'utente (vedi revoca di colonna più sotto): solo il seed o un admin via
-- service_role può promuovere un curatore.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_curator  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- --- Funzioni helper ---------------------------------------------------------

-- Vero se l'utente indicato (default: utente corrente) è un curatore.
-- SECURITY DEFINER: legge profiles scavalcando la RLS, così è usabile nelle policy.
create or replace function public.is_curator(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_curator from public.profiles p where p.id = uid), false);
$$;

-- Offuscamento DETERMINISTICO di un punto geografico.
-- Un POI sensibile (hazard_flag) non espone mai le coordinate esatte: viene
-- proiettato di una distanza e un azimut ricavati in modo stabile dall'id del POI
-- (stesso id -> stesso spostamento, non un jitter casuale ad ogni lettura).
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
-- le righe; qui si concedono i privilegi di base. `is_curator` è escluso
-- dall'update per impedire l'auto-promozione a curatore.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
