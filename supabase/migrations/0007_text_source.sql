-- =============================================================================
-- 0007_text_source.sql — L'audio è la memoria; il testo dichiara la sua origine
--
-- Decisione di progetto: l'audio originale del testimone non viene mai
-- sostituito dal testo. Il testo che accompagna una memoria è un indice di
-- servizio e deve SEMPRE dichiarare da dove viene, così l'interfaccia non può
-- spacciarlo per le parole del testimone.
-- =============================================================================

-- Origine del testo associato a una memoria.
--   raccoglitore = scritto a mano da chi ha raccolto la testimonianza
--   automatica   = prodotto da una macchina (Whisper); da mostrare come tale
--   nessuno      = la memoria è solo audio, senza testo
create type public.text_source as enum ('raccoglitore', 'automatica', 'nessuno');

alter table public.contributions
  add column text_source       public.text_source not null default 'nessuno',
  add column audio_duration_ms integer;

-- Durata plausibile (se indicata): niente valori negativi o assurdi (> 2 ore).
alter table public.contributions
  add constraint contributions_audio_duration_sane
  check (audio_duration_ms is null or audio_duration_ms between 0 and 7200000);

-- Allinea i dati esistenti PRIMA di imporre il vincolo di coerenza.
update public.contributions
   set text_source = 'automatica'
 where transcript is not null;

update public.contributions
   set text_source = 'raccoglitore'
 where transcript is null and body is not null;

-- L'origine NON è un campo libero che il chiamante può dimenticare o falsare:
-- è derivata da quale colonna contiene il testo. `transcript` esiste solo se
-- l'ha prodotto una macchina, `body` solo se l'ha scritto una persona.
-- Così l'invariante è garantito dalla struttura, non dalla disciplina di chi
-- scrive il codice.
create or replace function public.set_text_source()
returns trigger
language plpgsql
as $$
begin
  new.text_source := case
    when new.transcript is not null then 'automatica'::public.text_source
    when new.body is not null       then 'raccoglitore'::public.text_source
    else                                 'nessuno'::public.text_source
  end;
  return new;
end;
$$;

create trigger contributions_set_text_source
  before insert or update on public.contributions
  for each row execute function public.set_text_source();

-- Rete di sicurezza: anche se un domani il trigger venisse disattivato, non
-- può esistere del testo senza origine dichiarata.
alter table public.contributions
  add constraint contributions_text_source_coerente
  check (
    case
      when body is null and transcript is null then text_source = 'nessuno'
      else text_source <> 'nessuno'
    end
  );

-- La vista pubblica espone l'origine del testo e la durata dell'audio, così il
-- client può sempre etichettare correttamente ciò che mostra.
-- NB: CREATE OR REPLACE mantiene le colonne esistenti nello stesso ordine e ne
-- aggiunge di nuove in coda.
create or replace view public.v_contributions_public as
select
  c.id,
  c.poi_id,
  c.kind,
  case when c.kind = 'testo' then c.body else null end as body,
  c.transcript,
  c.media_path,
  c.is_anonymous,
  case when c.is_anonymous then a.label else pr.display_name end as author_label,
  case when c.is_anonymous then a.public_id else null end as author_public_id,
  c.created_at,
  c.narrator_name,
  c.narrator_birth_year,
  c.text_source,
  c.audio_duration_ms
from public.contributions c
left join public.anon_aliases a on a.author_id = c.author_id
left join public.profiles pr on pr.id = c.author_id
where c.status = 'approvato'
  and c.narrator_consent = true;
