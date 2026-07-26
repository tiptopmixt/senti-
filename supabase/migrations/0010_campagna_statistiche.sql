-- =============================================================================
-- 0010_campagna_statistiche.sql — Dati e statistiche della campagna
--
-- La scheda "info" all'inizio del percorso mostra, oltre alla breve storia
-- (bio), alcuni dati tecnici: quante persone hanno combattuto, chi ha vinto e
-- quanto è durata la campagna. Sono contenuto editoriale/storico: vanno con la
-- fonte, e restano separati dai ritrovamenti degli utenti.
-- =============================================================================

alter table public.commanders
  add column combattenti text,   -- es. "~63.000 francesi vs ~80.000 austro-sardi"
  add column esito       text,   -- chi ha vinto / come è finita
  add column durata      text;   -- quanto è durata la campagna

-- Le nuove colonne vanno in coda alla vista pubblica (CREATE OR REPLACE).
create or replace view public.v_commanders_public as
select
  id, slug, name, epoch, region, bio, source_name, source_url,
  combattenti, esito, durata
from public.commanders;
