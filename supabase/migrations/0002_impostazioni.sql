-- =============================================================================
-- 0002_impostazioni.sql — Impostazioni dell'app modificabili senza migrazione
--
-- Piccoli parametri (soglie, limiti) che possono cambiare nel tempo senza
-- toccare lo schema. Letti dalle funzioni con public.limite('chiave').
-- =============================================================================

create table public.app_settings (
  chiave      text primary key,
  valore      integer not null,
  descrizione text,
  creato_il   timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- Lettura pubblica (sono parametri non sensibili); scrittura solo moderatori.
create policy app_settings_select_all on public.app_settings for select using (true);
create policy app_settings_mod_write on public.app_settings for all
  using (public.is_moderator()) with check (public.is_moderator());
grant select on public.app_settings to anon, authenticated;

-- Legge un parametro numerico (null se assente).
create or replace function public.limite(p_chiave text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select valore from public.app_settings where chiave = p_chiave;
$$;
grant execute on function public.limite(text) to anon, authenticated;

-- Valori iniziali.
insert into public.app_settings (chiave, valore, descrizione) values
  ('segnalazioni_per_revisione', 3,
   'Numero di segnalazioni distinte oltre il quale un ritrovamento viene evidenziato in cima alla coda dei moderatori.'),
  ('ritrovamenti_al_mese', 60,
   'Massimo ritrovamenti pubblicabili da un utente in un mese (anti-abuso).');
