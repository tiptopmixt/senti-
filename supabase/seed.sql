-- =============================================================================
-- seed.sql — Dati dimostrativi. SOLO SVILUPPO, MAI in produzione.
--
-- Contiene: 3 utenti demo, 6 POI reali del territorio con memorie (inclusa una
-- coppia sullo stesso episodio e una con date discordanti), 1 campagna curata
-- (Napoleone, canale del Brenta, settembre 1796) con 15 segmenti datati misti
-- attestato/ipotetico, 2 sentieri CAI importati (nascono ipotetico), e alcuni
-- centri abitati per la vista "luoghi da raccontare".
--
-- Password degli utenti demo (solo dev): demo123456
-- =============================================================================

-- --- Utenti demo -------------------------------------------------------------
-- Il trigger handle_new_user crea automaticamente profilo e alias anonimo.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'anna@demo.local', crypt('demo123456', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'marco@demo.local', crypt('demo123456', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'curatrice@demo.local', crypt('demo123456', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"anna@demo.local"}', 'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"marco@demo.local"}', 'email', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   '{"sub":"33333333-3333-3333-3333-333333333333","email":"curatrice@demo.local"}', 'email', now(), now(), now());

-- Nomi e ruolo curatore (is_curator non è modificabile dal client, qui siamo postgres).
update public.profiles set display_name = 'Anna'      where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Marco'     where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Curatrice', is_curator = true
  where id = '33333333-3333-3333-3333-333333333333';

-- --- POI reali del territorio ------------------------------------------------
-- p6 è sensibile (hazard_flag): le sue coordinate non escono mai esatte dalle viste.
insert into public.pois (id, author_id, name, description, geog, hazard_flag) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Ponte degli Alpini', 'Il ponte coperto sul Brenta a Bassano, progettato dal Palladio.',
   st_setsrid(st_point(11.7342, 45.7666), 4326)::geography, false),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Grotte di Oliero', 'Sorgenti e grotte lungo il Brenta, presso Valstagna.',
   st_setsrid(st_point(11.6650, 45.8480), 4326)::geography, false),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
   'Sacrario del Monte Grappa', 'Il sacrario militare in cima al Grappa.',
   st_setsrid(st_point(11.7997, 45.8726), 4326)::geography, false),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Asiago', 'Il centro dell''Altopiano, ricostruito dopo la Grande Guerra.',
   st_setsrid(st_point(11.5100, 45.8767), 4326)::geography, false),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Cismon del Grappa', 'Borgo all''imbocco del canale del Brenta.',
   st_setsrid(st_point(11.7267, 45.9186), 4326)::geography, false),
  ('a0000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333',
   'Ex polveriera di Solagna', 'Sito sensibile lungo la valle (posizione approssimata).',
   st_setsrid(st_point(11.7180, 45.8080), 4326)::geography, true);

-- --- Memorie (contributions) -------------------------------------------------
-- Tutte approvate e con consenso del narratore -> generano punti per Anna.

-- Coppia sullo STESSO EPISODIO (ricostruzione del ponte, 1948) su Ponte degli Alpini.
insert into public.contributions
  (id, author_id, collected_by, poi_id, kind, body, narrator_name, narrator_birth_year, narrator_consent, is_anonymous, status)
values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000001', 'testo',
   'Ricordo quando gli alpini rifecero il ponte dopo la guerra, nel 1948. Tutto il paese aiuto a portare le travi.',
   'Bruno Marchetti', 1929, true, false, 'approvato'),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000001', 'testo',
   'Da bambina vidi gli alpini ricostruire il Ponte Vecchio nel 1948. C''erano canti e polenta per tutti.',
   'Elsa Girardi', 1933, true, true, 'approvato');

-- Coppia con DATE DISCORDANTI (bombardamento di Asiago) su Asiago.
insert into public.contributions
  (id, author_id, collected_by, poi_id, kind, body, narrator_name, narrator_birth_year, narrator_consent, is_anonymous, status)
values
  ('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000004', 'testo',
   'Il grande bombardamento su Asiago fu nel maggio del 1916.',
   'Guido Rigoni', 1928, true, false, 'approvato'),
  ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000004', 'testo',
   'Mia nonna diceva che Asiago fu colpita nel giugno 1916, non a maggio.',
   'Maria Stella', 1931, true, true, 'approvato');

-- Altre memorie sparse.
insert into public.contributions
  (author_id, collected_by, poi_id, kind, body, narrator_name, narrator_birth_year, narrator_consent, is_anonymous, status)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000001', 'testo',
   'Il sabato sul ponte c''era il mercato e si sentiva profumo di bacala.',
   'Bruno Marchetti', 1929, true, false, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000002', 'testo',
   'Da ragazzi ci si tuffava nelle acque fredde delle sorgenti di Oliero.',
   'Rina Bonato', 1936, true, true, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000003', 'testo',
   'Salivamo al sacrario ogni anno con la sezione alpini, a piedi da Romano.',
   'Attilio Zen', 1927, true, false, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000005', 'testo',
   'Alla stazione di Cismon passavano i treni carichi di legname dalla valle.',
   'Teresa Fabris', 1934, true, true, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000006', 'testo',
   'Da bambini ci dicevano di stare lontani dalla vecchia polveriera.',
   'Gino Parolin', 1930, true, true, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000002', 'testo',
   'I battellieri portavano il legname sulle zattere lungo il Brenta fino a Venezia.',
   'Rina Bonato', 1936, true, false, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000003', 'testo',
   'Mio zio non torno mai dal Grappa: il suo nome e su una lapide del sacrario.',
   'Attilio Zen', 1927, true, true, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000005', 'testo',
   'A Cismon si passava il confine di notte, con la neve, per portare il sale.',
   'Teresa Fabris', 1934, true, false, 'approvato'),
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000006', 'testo',
   'Una volta la polveriera salto in aria e i vetri tremarono in tutta la valle.',
   'Gino Parolin', 1930, true, false, 'approvato');

-- Collegamenti editoriali tra contributi.
insert into public.contribution_links (from_contribution, to_contribution, kind, note, created_by) values
  ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'stesso_episodio',
   'Due testimoni della ricostruzione del ponte nel 1948.', '33333333-3333-3333-3333-333333333333'),
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004', 'conflitto',
   'Date discordanti sul bombardamento di Asiago (maggio vs giugno 1916).', '33333333-3333-3333-3333-333333333333');

-- --- Centri abitati (stile GeoNames) -----------------------------------------
insert into public.places (id, name, ascii_name, population, admin1, country_code, feature_code, geog) values
  (3181557, 'Bassano del Grappa', 'Bassano del Grappa', 43200, '20', 'IT', 'PPL', st_setsrid(st_point(11.7342, 45.7666), 4326)::geography),
  (3173864, 'Marostica',          'Marostica',          13800, '20', 'IT', 'PPL', st_setsrid(st_point(11.6560, 45.7450), 4326)::geography),
  (3182997, 'Asiago',             'Asiago',              6300, '20', 'IT', 'PPL', st_setsrid(st_point(11.5100, 45.8767), 4326)::geography),
  (3164450, 'Valstagna',          'Valstagna',           1900, '20', 'IT', 'PPL', st_setsrid(st_point(11.6614, 45.8514), 4326)::geography),
  (3178650, 'Cismon del Grappa',  'Cismon del Grappa',    900, '20', 'IT', 'PPL', st_setsrid(st_point(11.7267, 45.9186), 4326)::geography),
  (3177700, 'Enego',              'Enego',               1800, '20', 'IT', 'PPL', st_setsrid(st_point(11.7100, 45.9450), 4326)::geography),
  (3165330, 'Solagna',            'Solagna',             1900, '20', 'IT', 'PPL', st_setsrid(st_point(11.7180, 45.8080), 4326)::geography);

-- --- Campagna curata: Napoleone nel canale del Brenta (settembre 1796) -------
insert into public.routes (id, kind, title, actor, geom, created_by) values
  ('c0000000-0000-0000-0000-000000000001', 'campagna',
   'Napoleone nel canale del Brenta', 'Napoleone',
   st_geomfromtext('LINESTRING(11.7342 45.7666, 11.7180 45.8080, 11.6614 45.8514, 11.7267 45.9186, 11.7440 45.9480)', 4326),
   '33333333-3333-3333-3333-333333333333');

-- 15 eventi datati come segmenti consecutivi; ogni terzo è 'attestato' (con fonte),
-- gli altri 'ipotetico'.
insert into public.route_segments (route_id, seq, geom, date_from, date_to, certainty, sources)
select
  'c0000000-0000-0000-0000-000000000001',
  gs,
  st_linesubstring(r.geom, (gs - 1) / 15.0, gs / 15.0),
  date '1796-09-01' + (gs - 1),
  date '1796-09-01' + (gs - 1),
  case when gs % 3 = 0 then 'attestato'::public.certainty else 'ipotetico'::public.certainty end,
  case when gs % 3 = 0
       then '[{"cit":"Bollettino dell''Armata d''Italia, settembre 1796"}]'::jsonb
       else '[]'::jsonb end
from generate_series(1, 15) as gs
cross join (select geom from public.routes where id = 'c0000000-0000-0000-0000-000000000001') as r;

-- --- Sentieri CAI importati (nascono ipotetico) ------------------------------
insert into public.routes (id, kind, title, actor, geom, source_ref, created_by) values
  ('c0000000-0000-0000-0000-000000000002', 'sentiero', 'Sentiero CAI 778', 'CAI 778',
   st_geomfromtext('LINESTRING(11.7342 45.7666, 11.7600 45.8000, 11.7997 45.8726)', 4326),
   'osm/relation/778', '33333333-3333-3333-3333-333333333333'),
  ('c0000000-0000-0000-0000-000000000003', 'sentiero', 'Sentiero CAI 925', 'CAI 925',
   st_geomfromtext('LINESTRING(11.5100 45.8767, 11.5500 45.9000, 11.6000 45.9200)', 4326),
   'osm/relation/925', '33333333-3333-3333-3333-333333333333');

insert into public.route_segments (route_id, seq, geom, certainty, sources)
select id, 1, geom, 'ipotetico'::public.certainty, '[]'::jsonb
from public.routes
where id in ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003');

-- --- Glossario toponimi del territorio pilota --------------------------------
-- Passato a Whisper come suggerimento: migliora molto il riconoscimento dei
-- nomi di luogo locali (che altrimenti vengono storpiati).
insert into public.toponym_glossary (area_name, area, terms, lang, is_default) values
  ('Valbrenta e Altopiano',
   st_geogfromtext('POLYGON((11.40 45.68, 11.95 45.68, 11.95 46.02, 11.40 46.02, 11.40 45.68))'),
   array[
     'Bassano del Grappa', 'Ponte degli Alpini', 'Ponte Vecchio', 'Brenta',
     'Canale del Brenta', 'Valbrenta', 'Valstagna', 'Oliero', 'Solagna',
     'Campolongo sul Brenta', 'Pove del Grappa', 'Romano d''Ezzelino',
     'Cismon del Grappa', 'Primolano', 'Enego', 'Monte Grappa', 'Cima Grappa',
     'Col Moschin', 'Asiago', 'Altopiano dei Sette Comuni', 'Gallio', 'Foza',
     'Roana', 'Rotzo', 'Conco', 'Lusiana', 'Marostica', 'Nove', 'Cartigliano',
     'Val Frenzela', 'Cala del Sasso', 'Sacrario', 'Sasso Stefani'
   ],
   'it', false),
  ('Default',
   null,
   array['Bassano del Grappa', 'Brenta', 'Monte Grappa', 'Asiago', 'Valbrenta'],
   'it', true);

-- --- Importanza degli eventi e anno delle memorie ----------------------------
-- I segmenti attestati della campagna sono i momenti salienti: si vedono da
-- più lontano nella colonna del tempo.
update public.route_segments
   set importance = 3
 where certainty = 'attestato'
   and route_id = 'c0000000-0000-0000-0000-000000000001';

-- Anno dell'episodio ricordato (dichiarato dai narratori): colloca le memorie
-- sulla linea del tempo accanto agli eventi delle campagne.
update public.contributions set event_year = 1948
 where id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
update public.contributions set event_year = 1916
 where id in ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004');
