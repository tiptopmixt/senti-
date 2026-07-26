-- =============================================================================
-- seed.sql — Dati dimostrativi. SOLO SVILUPPO, MAI in produzione.
--
-- Il contenuto storico (imperi, condottieri, percorsi) sta nella MIGRAZIONE
-- 0012_contenuti_imperi.sql, così esiste anche in produzione. Qui restano solo i
-- dati DEMO: 3 utenti di prova e alcuni ritrovamenti lungo la Campagna d'Italia
-- di Napoleone (che aggancia il percorso 'napoleone_it' creato dalla migrazione).
--
-- Password degli utenti demo (solo dev): demo123456
-- =============================================================================

-- --- Utenti demo -------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'anna@demo.local', crypt('demo123456', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'marco@demo.local', crypt('demo123456', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'moderatore@demo.local', crypt('demo123456', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"anna@demo.local"}', 'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"marco@demo.local"}', 'email', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   '{"sub":"33333333-3333-3333-3333-333333333333","email":"moderatore@demo.local"}', 'email', now(), now(), now());

update public.profiles set display_name = 'Anna'  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Marco' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Moderatore', is_moderator = true
  where id = '33333333-3333-3333-3333-333333333333';

-- --- Ritrovamenti demo lungo la Campagna d'Italia di Napoleone ---------------
-- Il percorso 'napoleone_it' viene dalla migrazione 0012.
do $$
declare
  r_napo uuid;
  p uuid;
begin
  select r.id into r_napo from public.routes r
    join public.commanders c on c.id = r.commander_id where c.slug = 'napoleone_it';

  insert into public.pois (author_id, name, finding_type, certainty, event_year, geog, route_id)
  values ('11111111-1111-1111-1111-111111111111', 'Bossoli presso il guado', 'munizioni', 'probabile', 1796,
          'SRID=4326;POINT(11.55 45.63)'::geography, r_napo) returning id into p;
  insert into public.contributions (author_id, poi_id, kind, body, voce_propria, permesso_terzi)
  values ('11111111-1111-1111-1111-111111111111', p, 'testo',
          'Trovati alcuni bossoli anneriti lungo l''argine, dopo una piena.', true, null);

  insert into public.pois (author_id, name, finding_type, certainty, event_year, geog, route_id)
  values ('22222222-2222-2222-2222-222222222222', 'Scontro al ponte', 'battaglia', 'ipotetico', 1796,
          'SRID=4326;POINT(11.63 45.69)'::geography, r_napo) returning id into p;
  insert into public.contributions (author_id, poi_id, kind, body, voce_propria, permesso_terzi)
  values ('22222222-2222-2222-2222-222222222222', p, 'testo',
          'I racconti di famiglia parlano di uno scontro proprio qui, ma non ho fonti.', true, null);

  insert into public.pois (author_id, name, finding_type, certainty, event_year, geog, hazard_flag, route_id)
  values ('11111111-1111-1111-1111-111111111111', 'Monete nel muretto', 'tesori', 'probabile', 1797,
          'SRID=4326;POINT(11.70 45.74)'::geography, true, r_napo) returning id into p;
  insert into public.contributions (author_id, poi_id, kind, body, voce_propria, permesso_terzi)
  values ('11111111-1111-1111-1111-111111111111', p, 'testo',
          'Due monete di rame in un muretto a secco. Posizione volutamente approssimata.', true, null);

  insert into public.pois (author_id, name, finding_type, certainty, geog, route_id)
  values ('22222222-2222-2222-2222-222222222222', 'Ammonite nel greto', 'fossili', 'attestato',
          'SRID=4326;POINT(11.58 45.66)'::geography, r_napo) returning id into p;
  insert into public.contributions (author_id, poi_id, kind, body, voce_propria, permesso_terzi)
  values ('22222222-2222-2222-2222-222222222222', p, 'testo',
          'Una bella ammonite nel greto del torrente: niente a che vedere con la guerra, ma affascinante.', true, null);

  insert into public.pois (author_id, name, finding_type, certainty, geog, route_id)
  values ('11111111-1111-1111-1111-111111111111', 'Vena di quarzo', 'minerali', 'probabile',
          'SRID=4326;POINT(11.66 45.71)'::geography, r_napo) returning id into p;
  insert into public.contributions (author_id, poi_id, kind, body, voce_propria, permesso_terzi)
  values ('11111111-1111-1111-1111-111111111111', p, 'testo',
          'Cristalli di quarzo affioranti dopo una frana lungo il sentiero.', true, null);
end $$;
