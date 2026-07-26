-- =============================================================================
-- 0011_imperi.sql — Gli imperi/potenze (livello padre dei condottieri)
--
-- Struttura a due livelli: un IMPERO/POTENZA (Roma, Persia, Mongoli, ...) contiene
-- più CONDOTTIERI/campagne (Cesare, Traiano, Scipione ...). Scegliendo un impero
-- sulla mappa si vedono tutte le sue campagne; ognuna ha il suo percorso e la sua
-- scheda, e anche l'impero ha una scheda (continente, epoca, apogeo).
--
-- È contenuto editoriale/storico: con fonte, separato dai ritrovamenti utenti.
-- =============================================================================

create table public.empires (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  continent   text,                 -- Europa, Asia, Africa, America, Globale
  region      text,
  epoch       text,                 -- durata dell'impero
  description text,                 -- breve storia
  apogeo      text,                 -- momento/estensione di massima potenza
  source_name text,
  source_url  text,
  created_at  timestamptz not null default now()
);
alter table public.empires enable row level security;
create policy empires_select_all on public.empires for select using (true);
create policy empires_mod_write on public.empires for all
  using (public.is_moderator()) with check (public.is_moderator());
grant select on public.empires to anon, authenticated;

-- Ogni condottiero appartiene (di norma) a un impero/potenza.
alter table public.commanders
  add column empire_id uuid references public.empires (id) on delete set null;
create index commanders_empire_idx on public.commanders (empire_id);

-- Viste pubbliche.
create view public.v_empires_public as
select id, slug, name, continent, region, epoch, description, apogeo, source_name, source_url
from public.empires;
grant select on public.v_empires_public to anon, authenticated;

-- Aggiungo empire_id in coda alla vista dei condottieri (CREATE OR REPLACE).
create or replace view public.v_commanders_public as
select
  id, slug, name, epoch, region, bio, source_name, source_url,
  combattenti, esito, durata, empire_id
from public.commanders;
