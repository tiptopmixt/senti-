-- =============================================================================
-- 01_limiti_test.sql — I limiti devono mordere lato database
--
-- Un limite applicato solo nell'interfaccia non è un limite: chiunque può
-- chiamare l'API direttamente. Questi test verificano che sia il database a
-- rifiutare, non il client a chiedere per favore.
-- =============================================================================

create extension if not exists pgtap;

begin;
select plan(5);

-- Anna  = 11111111-1111-1111-1111-111111111111 (utente normale)
-- Curatrice = 33333333-3333-3333-3333-333333333333

-- 1) Registrazione oltre la durata massima: respinta.
select throws_ok(
  $$ insert into public.contributions (author_id, kind, media_path, narrator_consent, audio_duration_ms)
     values ('11111111-1111-1111-1111-111111111111', 'audio', 'lunga.webm', true, 240000) $$,
  '23514',
  null,
  'Audio oltre la durata massima respinto'
);

-- 2) Registrazione entro il limite: ammessa.
select lives_ok(
  $$ insert into public.contributions (author_id, kind, media_path, narrator_consent, audio_duration_ms)
     values ('11111111-1111-1111-1111-111111111111', 'audio', 'breve.webm', true, 120000) $$,
  'Audio entro la durata massima ammesso'
);

-- 3) Testo oltre la lunghezza massima: respinto.
select throws_ok(
  $$ insert into public.contributions (author_id, kind, body, narrator_consent)
     values ('11111111-1111-1111-1111-111111111111', 'testo', repeat('a', 2000), true) $$,
  '23514',
  null,
  'Testo oltre la lunghezza massima respinto'
);

-- 4) Tetto mensile: portiamo Anna esattamente al limite, poi uno in più deve fallire.
do $$
declare
  usati int;
  mancanti int;
  i int;
begin
  select count(*) into usati
    from public.contributions
   where author_id = '11111111-1111-1111-1111-111111111111'
     and created_at >= date_trunc('month', now());

  mancanti := public.limite('contributi_per_mese') - usati;
  for i in 1..greatest(mancanti, 0) loop
    insert into public.contributions (author_id, kind, body, narrator_consent)
    values ('11111111-1111-1111-1111-111111111111', 'testo', 'riempitivo ' || i, true);
  end loop;
end $$;

select throws_ok(
  $$ insert into public.contributions (author_id, kind, body, narrator_consent)
     values ('11111111-1111-1111-1111-111111111111', 'testo', 'uno oltre il tetto', true) $$,
  '23514',
  null,
  'Tetto mensile rispettato: il contributo in più è respinto'
);

-- 5) I curatori raccolgono sul campo: nessun tetto mensile.
do $$
declare i int;
begin
  for i in 1..30 loop
    insert into public.contributions (author_id, kind, body, narrator_consent)
    values ('33333333-3333-3333-3333-333333333333', 'testo', 'raccolta ' || i, true);
  end loop;
end $$;

select ok(
  (select count(*) >= 30
     from public.contributions
    where author_id = '33333333-3333-3333-3333-333333333333'
      and created_at >= date_trunc('month', now())),
  'Curatrice esente dal tetto mensile'
);

select * from finish();
rollback;
