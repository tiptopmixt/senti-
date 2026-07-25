-- =============================================================================
-- 0015_declarations_delete.sql — La dichiarazione segue il contenuto
--
-- Il trigger append-only di 0014 bloccava OGNI delete sulle dichiarazioni,
-- inclusa la cancellazione a cascata quando l'utente elimina un proprio
-- contributo (consentita dalla RLS). Risultato: i contributi con dichiarazione
-- diventavano non cancellabili.
--
-- La dichiarazione resta IMMUTABILE (niente UPDATE), ma se il contenuto sparisce
-- può sparire con lui: una prova su un contenuto che non esiste più non serve.
-- L'utente non può comunque cancellarla direttamente (nessun grant di delete):
-- l'unica via è il cascade dalla cancellazione del proprio contributo.
-- =============================================================================

drop trigger if exists contribution_declarations_no_delete on public.contribution_declarations;
-- Il trigger contribution_declarations_no_update resta: la prova non si modifica.
