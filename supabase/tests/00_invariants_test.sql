-- =============================================================================
-- 00_invariants_test.sql — Cancello di qualità (pgTAP)
--
-- Verifica gli invarianti non negoziabili del progetto. Se anche un solo test
-- fallisce, non si prosegue.
--
-- Gli utenti vengono simulati impostando role=authenticated e il claim JWT
-- 'sub' (che auth.uid() legge da request.jwt.claims).
-- =============================================================================

create extension if not exists pgtap;

begin;
select plan(12);

-- Costanti utenti (dal seed).
--   Anna  = 11111111-1111-1111-1111-111111111111
--   Marco = 22222222-2222-2222-2222-222222222222

-- --- Blocco A: controlli a livello schema/proprietario -----------------------

-- 1) Nessuna vista pubblica espone author_id.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name like 'v_%_public'
      and column_name = 'author_id'),
  0,
  'Nessuna vista v_*_public espone author_id'
);

-- 2) POI hazard: le coordinate pubbliche sono offuscate (diverse dalle reali).
select ok(
  (select st_distance(p.geog, st_setsrid(st_point(v.lon, v.lat), 4326)::geography) > 0
     from public.pois p
     join public.v_pois_public v on v.id = p.id
    where p.hazard_flag
    limit 1),
  'POI con hazard_flag: coordinate pubbliche offuscate (mai esatte)'
);

-- 3) Trascrizione vietata senza consenso del narratore.
select throws_ok(
  $$ insert into public.contributions (kind, transcript, narrator_consent)
     values ('audio', 'trascrizione', false) $$,
  '23514',
  null,
  'Contributo con narrator_consent=false NON è trascrivibile'
);

-- 4) Trascrizione ammessa con consenso.
select lives_ok(
  $$ insert into public.contributions (kind, transcript, narrator_consent)
     values ('audio', 'trascrizione', true) $$,
  'Con consenso la trascrizione è ammessa'
);

-- --- Blocco B: comportamenti con utenti simulati -----------------------------

-- 5) Voto sul PROPRIO contenuto rifiutato (Anna vota un contributo di Anna).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ insert into public.post_votes (contribution_id, value)
     values ('b0000000-0000-0000-0000-000000000001', 1) $$,
  'P0001',
  null,
  'Voto sul proprio contenuto rifiutato'
);

-- 6) Voto sul contenuto altrui ammesso (Marco vota un contributo di Anna).
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ insert into public.post_votes (contribution_id, value)
     values ('b0000000-0000-0000-0000-000000000001', 1) $$,
  'Voto sul contenuto altrui ammesso'
);

-- 7) Marco non vede il ledger di Anna (RLS: solo il titolare).
select is(
  (select count(*)::int from public.points_ledger
    where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'points_ledger: Marco non vede le righe di Anna'
);

-- 8) Anna vede solo il proprio ledger.
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::int from public.points_ledger),
  13,
  'points_ledger: Anna vede le proprie 13 righe'
);

-- 9) Il client non può scrivere sul ledger (nessun grant di insert).
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ insert into public.points_ledger (user_id, delta, reason)
     values ('22222222-2222-2222-2222-222222222222', 5, 'aggiustamento') $$,
  '42501',
  null,
  'points_ledger: scrittura dal client negata (permission denied)'
);

-- 12) Marco non vede i contributi di Anna sulla tabella base (RLS).
select is(
  (select count(*)::int from public.contributions
    where author_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'contributions: Marco non vede i contributi di Anna (tabella base)'
);

reset role;

-- --- Blocco C: append-only del ledger (come proprietario) ---------------------

-- 10) UPDATE sul ledger vietato.
select throws_ok(
  $$ update public.points_ledger set delta = 0 $$,
  'P0001',
  null,
  'points_ledger è append-only: UPDATE vietato'
);

-- 11) DELETE sul ledger vietato.
select throws_ok(
  $$ delete from public.points_ledger $$,
  'P0001',
  null,
  'points_ledger è append-only: DELETE vietato'
);

select * from finish();
rollback;
