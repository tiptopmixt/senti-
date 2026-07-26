-- =============================================================================
-- 0013_battaglie.sql — Punti di scontro (battaglie) lungo i percorsi
--
-- Una battaglia è un punto sul percorso di un condottiero, con le DUE PARTI in
-- lotta (chi contro chi) e l'esito. Contenuto editoriale/storico con fonte,
-- separato dai ritrovamenti degli utenti. Gira anche in produzione.
-- =============================================================================

create table if not exists public.battles (
  id           uuid primary key default gen_random_uuid(),
  commander_id uuid references public.commanders (id) on delete set null,
  name         text not null,
  year         integer,
  side_a       text,               -- una parte in lotta
  side_b       text,               -- l'altra parte
  outcome      text,               -- come è finita
  geog         geography(Point, 4326) not null,
  source_name  text,
  created_at   timestamptz not null default now()
);
create index if not exists battles_commander_idx on public.battles (commander_id);
alter table public.battles enable row level security;

do $$ begin
  create policy battles_select_all on public.battles for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy battles_mod_write on public.battles for all
    using (public.is_moderator()) with check (public.is_moderator());
exception when duplicate_object then null; end $$;
grant select on public.battles to anon, authenticated;

create or replace view public.v_battles_public as
select
  b.id, b.commander_id, b.name, b.year, b.side_a, b.side_b, b.outcome,
  b.source_name,
  st_y(b.geog::geometry) as lat,
  st_x(b.geog::geometry) as lon
from public.battles b;
grant select on public.v_battles_public to anon, authenticated;

-- --- Battaglie principali (agganciate al condottiero via slug) ----------------
insert into public.battles (commander_id, name, year, side_a, side_b, outcome, geog, source_name)
select c.id, v.name, v.year, v.side_a, v.side_b, v.outcome,
       st_setsrid(st_point(v.lon, v.lat), 4326)::geography, 'Wikipedia'
from (values
  ('ramesse',      'Battaglia di Kadesh',       -1274, 'Egizi (Ramesse II)',        'Ittiti',                    'Pareggio, primo trattato di pace', 36.52, 34.55),
  ('thutmose',     'Battaglia di Megiddo',      -1457, 'Egizi (Thutmose III)',      'Coalizione cananea',        'Vittoria egizia',                  35.18, 32.58),
  ('dario',        'Battaglia di Maratona',     -490,  'Persiani (Dario I)',        'Ateniesi',                  'Vittoria greca',                   23.96, 38.15),
  ('serse',        'Battaglia delle Termopili', -480,  'Persiani (Serse)',          'Spartani (Leonida)',        'Vittoria persiana',                22.54, 38.80),
  ('temistocle',   'Battaglia di Salamina',     -480,  'Persiani (Serse)',          'Greci (Temistocle)',        'Vittoria greca',                   23.50, 37.96),
  ('alessandro',   'Battaglia di Isso',         -333,  'Macedoni (Alessandro)',     'Persiani (Dario III)',      'Vittoria macedone',                36.20, 36.85),
  ('alessandro',   'Battaglia di Gaugamela',    -331,  'Macedoni (Alessandro)',     'Persiani (Dario III)',      'Vittoria macedone',                43.50, 36.36),
  ('annibale',     'Battaglia di Canne',        -216,  'Cartaginesi (Annibale)',    'Romani',                    'Vittoria cartaginese',             16.13, 41.30),
  ('scipione',     'Battaglia di Zama',         -202,  'Romani (Scipione)',         'Cartaginesi (Annibale)',    'Vittoria romana',                  9.40,  36.30),
  ('cesare',       'Battaglia di Alesia',       -52,   'Romani (Cesare)',           'Galli (Vercingetorige)',    'Vittoria romana',                  4.50,  47.54),
  ('traiano',      'Assedio di Sarmizegetusa',  106,   'Romani (Traiano)',          'Daci (Decebalo)',           'Vittoria romana',                  23.31, 45.62),
  ('augusto',      'Battaglia di Azio',         -31,   'Ottaviano (Augusto)',       'Antonio e Cleopatra',       'Vittoria di Ottaviano',            20.90, 38.90),
  ('khalid',       'Battaglia dello Yarmuk',    636,   'Arabi (Khalid)',            'Bizantini',                 'Vittoria araba',                   36.05, 32.73),
  ('martello',     'Battaglia di Poitiers',     732,   'Franchi (Carlo Martello)',  'Arabi',                     'Vittoria franca',                  0.34,  46.58),
  ('saladino',     'Battaglia di Hattin',       1187,  'Ayyubidi (Saladino)',       'Crociati',                  'Vittoria di Saladino',             35.80, 32.80),
  ('goffredo',     'Assedio di Gerusalemme',    1099,  'Crociati (Goffredo)',       'Fatimidi',                  'Presa crociata',                   35.23, 31.78),
  ('gengis',       'Assedio di Samarcanda',     1220,  'Mongoli (Gengis Khan)',     'Impero corasmio',           'Vittoria mongola',                 66.97, 39.65),
  ('maomettoii',   'Caduta di Costantinopoli',  1453,  'Ottomani (Maometto II)',    'Bizantini',                 'Vittoria ottomana',                28.98, 41.01),
  ('solimano',     'Battaglia di Mohács',       1526,  'Ottomani (Solimano)',       'Ungheresi',                 'Vittoria ottomana',                18.70, 45.98),
  ('cortes',       'Caduta di Tenochtitlan',    1521,  'Spagnoli (Cortés) e alleati','Aztechi',                  'Vittoria spagnola',               -99.13, 19.43),
  ('pizarro',      'Battaglia di Cajamarca',    1532,  'Spagnoli (Pizarro)',        'Inca (Atahualpa)',          'Vittoria spagnola',               -78.50, -7.16),
  ('napoleone_eg', 'Battaglia delle Piramidi',  1798,  'Francesi (Napoleone)',      'Mamelucchi',                'Vittoria francese',                31.20, 30.02),
  ('kutuzov',      'Battaglia di Borodino',     1812,  'Francesi (Napoleone)',      'Russi (Kutuzov)',           'Esito incerto, ritirata russa',    35.82, 55.51),
  ('napoleone_wa', 'Battaglia di Waterloo',     1815,  'Francesi (Napoleone)',      'Alleati (Wellington)',      'Sconfitta francese',               4.40,  50.68),
  ('pietro',       'Battaglia di Poltava',      1709,  'Russi (Pietro il Grande)',  'Svedesi',                   'Vittoria russa',                   34.55, 49.59),
  ('garibaldi',    'Battaglia di Calatafimi',   1860,  'Garibaldini',               'Borbonici',                 'Vittoria garibaldina',             12.87, 37.91),
  ('grande_guerra','Battaglia di Caporetto',    1917,  'Italiani',                  'Austro-tedeschi',           'Sconfitta italiana',               13.48, 46.05),
  ('seconda_guerra','Battaglia di Montecassino',1944,  'Alleati',                   'Tedeschi',                  'Vittoria alleata',                 13.81, 41.49),
  ('normandia',    'Sbarco in Normandia',       1944,  'Alleati',                   'Tedeschi',                  'Vittoria alleata',                 -0.87, 49.34)
) as v(cmd_slug, name, year, side_a, side_b, outcome, lon, lat)
join public.commanders c on c.slug = v.cmd_slug
where not exists (
  select 1 from public.battles b where b.name = v.name and b.commander_id = c.id
);
