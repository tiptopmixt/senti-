-- =============================================================================
-- 0009_limiti.sql — Limiti di durata, lunghezza e quantità
--
-- Due problemi distinti:
--  1. Registrazioni e testi troppo lunghi diventano illeggibili e pesanti.
--  2. Un utente può inondare la piattaforma.
--
-- I limiti stanno in una TABELLA, non nel codice: durante il pilota andranno
-- ritoccati, e non deve servire una migrazione ogni volta.
--
-- Imposti dal database, non dall'interfaccia: un limite applicato solo nel
-- client non è un limite, è un suggerimento.
-- =============================================================================

create table public.app_settings (
  chiave      text primary key,
  valore      integer not null,
  descrizione text not null
);
alter table public.app_settings enable row level security;

insert into public.app_settings (chiave, valore, descrizione) values
  ('audio_durata_massima_ms', 180000,
   'Durata massima di una registrazione, in millisecondi (3 minuti). Un episodio raccontato bene ci sta dentro.'),
  ('testo_lunghezza_massima', 1500,
   'Caratteri massimi per la nota di chi raccoglie (~250 parole).'),
  ('contributi_per_mese', 20,
   'Contributi al mese per utente. I curatori sono esenti: raccolgono sul campo.');

-- I limiti sono pubblici: il client deve poterli mostrare PRIMA che l'utente
-- registri, non dopo averlo respinto.
create policy app_settings_select_all on public.app_settings for select
  using (true);
create policy app_settings_curator_write on public.app_settings for all
  using (public.is_curator())
  with check (public.is_curator());

grant select on public.app_settings to anon, authenticated;

/** Valore di un limite, o NULL se non impostato. */
create or replace function public.limite(p_chiave text)
returns integer
language sql
stable
as $$
  select valore from public.app_settings where chiave = p_chiave;
$$;

-- --- Applicazione dei limiti -------------------------------------------------
create or replace function public.applica_limiti_contributi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_durata integer;
  max_testo  integer;
  max_mese   integer;
  usati      integer;
begin
  max_durata := public.limite('audio_durata_massima_ms');
  max_testo  := public.limite('testo_lunghezza_massima');
  max_mese   := public.limite('contributi_per_mese');

  -- Durata: vale per tutti, curatori compresi. Un audio di mezz'ora non lo
  -- ascolta nessuno, chiunque l'abbia caricato.
  if new.audio_duration_ms is not null
     and max_durata is not null
     and new.audio_duration_ms > max_durata then
    raise exception 'Registrazione troppo lunga: il massimo è % secondi', max_durata / 1000
      using errcode = 'check_violation';
  end if;

  -- Lunghezza del testo: idem.
  if new.body is not null
     and max_testo is not null
     and char_length(new.body) > max_testo then
    raise exception 'Testo troppo lungo: il massimo è % caratteri', max_testo
      using errcode = 'check_violation';
  end if;

  -- Tetto mensile: solo sui nuovi contributi, e non per i curatori.
  if tg_op = 'INSERT'
     and new.author_id is not null
     and max_mese is not null
     and not public.is_curator(new.author_id) then
    select count(*) into usati
      from public.contributions
     where author_id = new.author_id
       and created_at >= date_trunc('month', now());

    if usati >= max_mese then
      raise exception 'Limite mensile raggiunto: % contributi al mese', max_mese
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger contributions_applica_limiti
  before insert or update on public.contributions
  for each row execute function public.applica_limiti_contributi();

-- --- Quanti ne restano a chi sta scrivendo -----------------------------------
-- Serve al client per dire "ti restano 14 memorie questo mese" invece di
-- scoprirlo sbattendo contro l'errore.
create or replace function public.contributi_rimanenti()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 0
    when public.is_curator(auth.uid()) then public.limite('contributi_per_mese')
    else greatest(
      0,
      coalesce(public.limite('contributi_per_mese'), 0) - (
        select count(*)::int
          from public.contributions
         where author_id = auth.uid()
           and created_at >= date_trunc('month', now())
      )
    )
  end;
$$;

grant execute on function public.limite(text) to anon, authenticated;
grant execute on function public.contributi_rimanenti() to authenticated;
