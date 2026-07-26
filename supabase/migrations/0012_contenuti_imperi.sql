-- =============================================================================
-- 0012_contenuti_imperi.sql — Contenuto editoriale: imperi, condottieri, percorsi
--
-- MIGRAZIONE DI CONTENUTO (non di schema): i percorsi principali sono già
-- tracciati dallo sviluppatore. A differenza del seed (solo sviluppo), questa
-- gira ANCHE in produzione, così imperi e campagne ci sono anche online.
-- Nessun dato utente/demo qui: solo contenuto storico con fonte.
--
-- Idempotente sui conflitti di slug: si può ri-eseguire senza duplicare.
-- =============================================================================

-- --- Imperi / potenze --------------------------------------------------------
insert into public.empires (slug, name, continent, region, epoch, description, apogeo, source_name) values
  ('egitto',    'Antico Egitto',        'Africa',  'Valle del Nilo',      '3100–30 a.C.',   'Una delle prime grandi civiltà, lungo il Nilo.',                 'Nuovo Regno (XVI–XI sec. a.C.)', 'Wikipedia'),
  ('persia',    'Impero Persiano',      'Asia',    'Medio Oriente',       '550–330 a.C.',   'Il più vasto impero dell''antichità, dagli Achemenidi.',         'Dario I (circa 500 a.C.)',       'Wikipedia'),
  ('grecia',    'Grecia e Macedonia',   'Europa',  'Mediterraneo orient.','V–IV sec. a.C.', 'Le città-stato greche e l''impero di Alessandro.',               'Alessandro Magno (323 a.C.)',    'Wikipedia'),
  ('cartagine', 'Cartagine',            'Africa',  'Nord Africa',         'IX–146 a.C.',    'Potenza marittima del Mediterraneo occidentale.',                'Guerre puniche (III sec. a.C.)', 'Wikipedia'),
  ('roma',      'Impero Romano',        'Europa',  'Mediterraneo',        '753 a.C.–476 d.C.','Il più grande impero dell''antichità occidentale.',            'Traiano (117 d.C.)',             'Wikipedia'),
  ('arabi',     'Mondo arabo-islamico', 'Asia',    'Arabia e Medio Or.',  'VII–XIII sec.',  'L''espansione dell''Islam dai deserti d''Arabia.',               'Califfato (VIII sec.)',          'Wikipedia'),
  ('franchi',   'Impero Carolingio',    'Europa',  'Europa occidentale',  'VIII–IX sec.',   'Il regno dei Franchi e la rinascita imperiale.',                 'Carlo Magno (800)',              'Wikipedia'),
  ('crociati',  'Le Crociate',          'Europa',  'Europa e Levante',    '1096–1291',      'Le spedizioni cristiane verso la Terra Santa.',                  'Regno di Gerusalemme (1099)',    'Wikipedia'),
  ('mongoli',   'Impero Mongolo',       'Asia',    'Asia centrale',       'XIII–XIV sec.',  'Il più vasto impero contiguo della storia.',                     'Gengis Khan e successori',       'Wikipedia'),
  ('ottomani',  'Impero Ottomano',      'Asia',    'Anatolia e Balcani',  '1299–1922',      'Impero a cavallo tra Europa e Asia.',                            'Solimano il Magnifico (XVI sec.)','Wikipedia'),
  ('spagna',    'Impero Spagnolo',      'America', 'Europa e Americhe',   'XV–XIX sec.',    'L''impero su cui non tramontava mai il sole.',                   'Conquista delle Americhe (XVI sec.)','Wikipedia'),
  ('francia',   'Impero Napoleonico',   'Europa',  'Europa',              '1804–1815',      'L''egemonia francese sull''Europa con Napoleone.',               'Apogeo del 1812',                'Wikipedia'),
  ('russia',    'Impero Russo',         'Europa',  'Russia',              '1547–1917',      'Il più esteso stato d''Europa.',                                 'XIX secolo',                     'Wikipedia'),
  ('italia',    'Risorgimento italiano','Europa',  'Italia',              '1848–1871',      'Il processo di unità nazionale italiana.',                       'Unità d''Italia (1861)',         'Wikipedia'),
  ('mondiali',  'Guerre Mondiali',      'Globale', 'Mondo',               '1914–1945',      'I due conflitti globali del Novecento.',                         'Metà del XX secolo',             'Wikipedia')
on conflict (slug) do nothing;

-- --- Condottieri (dentro gli imperi) -----------------------------------------
insert into public.commanders (empire_id, slug, name, epoch, region, bio, combattenti, esito, durata, source_name)
select e.id, v.slug, v.name, v.epoch, v.region, v.bio, v.comb, v.esito, v.durata, 'Wikipedia'
from (values
  ('egitto','ramesse','Ramesse II','XIII sec. a.C.','Egitto e Siria','Il faraone della battaglia di Kadesh contro gli Ittiti.','~20.000 egizi','Pareggio, primo trattato di pace noto','1274 a.C.'),
  ('egitto','thutmose','Thutmose III','XV sec. a.C.','Egitto e Canaan','Il faraone conquistatore, vittorioso a Megiddo.','Esercito egizio','Vittoria egizia','1457 a.C.'),
  ('persia','ciro','Ciro il Grande','VI sec. a.C.','Medio Oriente','Fondatore dell''impero achemenide, conquistò Babilonia.','Esercito persiano','Conquista di Babilonia','539 a.C.'),
  ('persia','dario','Dario I','490 a.C.','Grecia','Guidò la prima guerra persiana, sconfitto a Maratona.','~25.000 persiani','Sconfitta a Maratona','490 a.C.'),
  ('persia','serse','Serse','480 a.C.','Grecia','Guidò la seconda invasione della Grecia.','Esercito enorme','Sconfitta a Salamina','480 a.C.'),
  ('grecia','leonida','Leonida','480 a.C.','Termopili','Re di Sparta, eroe delle Termopili.','300 spartani e alleati','Sconfitta eroica','480 a.C.'),
  ('grecia','temistocle','Temistocle','480 a.C.','Salamina','Stratega ateniese, vincitore navale a Salamina.','Flotta greca','Vittoria navale decisiva','480 a.C.'),
  ('grecia','alessandro','Alessandro Magno','334–323 a.C.','Dall''Egitto all''Indo','Conquistò il più grande impero dell''antichità.','~48.000 macedoni','Vittoria, impero fino all''Indo','334–323 a.C.'),
  ('cartagine','annibale','Annibale','218–202 a.C.','Alpi e Italia','Attraversò le Alpi con gli elefanti nella seconda guerra punica.','~50.000 e 37 elefanti','Vittoria a Canne, sconfitta a Zama','218–202 a.C.'),
  ('cartagine','amilcare','Amilcare Barca','III sec. a.C.','Iberia','Padre di Annibale, espanse Cartagine in Iberia.','Esercito cartaginese','Espansione in Iberia','237–228 a.C.'),
  ('roma','scipione','Scipione l''Africano','202 a.C.','Nord Africa','Sconfisse Annibale a Zama.','~30.000 romani','Vittoria decisiva su Cartagine','202 a.C.'),
  ('roma','cesare','Giulio Cesare','58–50 a.C.','Gallia','Conquistò la Gallia, narrata nel De bello Gallico.','~50.000 legionari','Conquista della Gallia','58–50 a.C.'),
  ('roma','traiano','Traiano','101–106 d.C.','Dacia','Portò l''impero alla massima espansione con le guerre daciche.','~150.000 romani','Conquista della Dacia','101–106 d.C.'),
  ('roma','augusto','Augusto','31 a.C.','Grecia','Vinse ad Azio, primo imperatore romano.','Flotta romana','Vittoria, nascita dell''impero','31 a.C.'),
  ('arabi','maometto','Maometto','622–632','Arabia','Unificò l''Arabia e fondò la comunità islamica.','Primi musulmani','Unificazione dell''Arabia','622–632'),
  ('arabi','khalid','Khalid ibn al-Walid','636','Siria','Generale delle conquiste islamiche, vittorioso allo Yarmuk.','Eserciti arabi','Conquista della Siria','636'),
  ('arabi','saladino','Saladino','1187','Terra Santa','Riconquistò Gerusalemme dopo la battaglia di Hattin.','Esercito ayyubide','Presa di Gerusalemme','1187'),
  ('franchi','carlomagno','Carlo Magno','768–814','Europa occidentale','Re dei Franchi, incoronato imperatore nell''800.','Esercito franco','Rinascita imperiale (800)','768–814'),
  ('franchi','martello','Carlo Martello','732','Francia','Arrestò l''avanzata araba a Poitiers.','Franchi','Vittoria a Poitiers','732'),
  ('crociati','goffredo','Goffredo di Buglione','1096–1099','Europa e Levante','Guidò la prima crociata alla presa di Gerusalemme.','~35.000 crociati','Presa di Gerusalemme','1096–1099'),
  ('crociati','riccardo','Riccardo Cuor di Leone','1189–1192','Terra Santa','Protagonista della terza crociata contro Saladino.','Crociati','Tregua con Saladino','1189–1192'),
  ('mongoli','gengis','Gengis Khan','1206–1227','Asia','Fondatore dell''impero mongolo.','~100.000 cavalieri','Impero dall''Asia all''Europa','1206–1227'),
  ('mongoli','subotai','Subotai','1236–1242','Russia e Ungheria','Generale mongolo, invase l''Europa orientale.','Orde mongole','Vittorie in Russia e Ungheria','1236–1242'),
  ('mongoli','kublai','Kublai Khan','1271–1279','Cina','Conquistò la Cina e fondò la dinastia Yuan.','Esercito mongolo','Conquista della Cina','1271–1279'),
  ('ottomani','maomettoii','Maometto II','1453','Costantinopoli','Conquistò Costantinopoli, fine dell''impero bizantino.','~80.000 ottomani','Presa di Costantinopoli','1453'),
  ('ottomani','solimano','Solimano il Magnifico','1520–1566','Balcani','Portò l''impero al suo apogeo.','~100.000 ottomani','Apogeo dell''impero','1520–1566'),
  ('spagna','colombo','Cristoforo Colombo','1492','Atlantico','Raggiunse le Americhe per la corona di Spagna.','3 caravelle','Sbarco nelle Americhe','1492'),
  ('spagna','cortes','Hernán Cortés','1519–1521','Messico','Conquistò l''impero azteco.','~500 spagnoli e alleati','Caduta di Tenochtitlan','1519–1521'),
  ('spagna','pizarro','Francisco Pizarro','1532–1533','Perù','Conquistò l''impero inca.','~180 spagnoli','Caduta dell''impero inca','1532–1533'),
  ('francia','napoleone_it','Napoleone — Campagna d''Italia','1796–1797','Italia settentrionale','Le prime grandi vittorie di Napoleone in Italia.','~40.000 francesi','Vittoria francese','1796–1797'),
  ('francia','napoleone_eg','Napoleone — Campagna d''Egitto','1798–1799','Egitto','Spedizione in Egitto, vittoria alle Piramidi.','Armata francese','Vittoria terrestre, poi ritiro','1798–1799'),
  ('francia','napoleone_ru','Napoleone — Campagna di Russia','1812','Russia','L''invasione della Russia finita in disastro.','~600.000 uomini','Disastro, ritirata da Mosca','1812'),
  ('francia','napoleone_wa','Napoleone — Waterloo','1815','Belgio','L''ultima battaglia di Napoleone.','~73.000 francesi','Sconfitta finale','1815'),
  ('russia','pietro','Pietro il Grande','1700–1721','Nord Europa','Vinse la grande guerra del Nord, Russia potenza europea.','Esercito russo','Vittoria su Poltava','1700–1721'),
  ('russia','kutuzov','Kutuzov','1812','Russia','Logorò la Grande Armata di Napoleone.','Esercito russo','Salvezza della Russia','1812'),
  ('italia','garibaldi','Garibaldi — Spedizione dei Mille','1860','Italia meridionale','Con i Mille conquistò il Sud per l''Unità d''Italia.','1.000 volontari','Conquista del Sud, Unità d''Italia','1860'),
  ('mondiali','grande_guerra','Prima Guerra Mondiale','1915–1918','Fronte italiano','Il fronte dell''Isonzo e del Grappa.','Milioni di soldati','Vittoria dell''Intesa','1915–1918'),
  ('mondiali','normandia','Sbarco in Normandia','1944','Francia','Lo sbarco alleato che aprì il fronte occidentale.','~156.000 alleati','Apertura del fronte occidentale','1944'),
  ('mondiali','seconda_guerra','Seconda Guerra Mondiale','1943–1945','Italia','La campagna d''Italia e la Linea Gotica.','Milioni di soldati','Vittoria alleata','1943–1945')
) as v(empire_slug, slug, name, epoch, region, bio, comb, esito, durata)
join public.empires e on e.slug = v.empire_slug
on conflict (slug) do nothing;

-- --- Percorsi (uno per condottiero) ------------------------------------------
insert into public.routes (commander_id, kind, title, geom)
select c.id, 'campagna', v.title, v.g::geometry
from (values
  ('ramesse',       'Battaglia di Kadesh',        'SRID=4326;LINESTRING(31.2 30.0, 34.8 31.5, 36.52 34.55)'),
  ('thutmose',      'Battaglia di Megiddo',       'SRID=4326;LINESTRING(31.2 30.0, 34.4 31.4, 35.18 32.58)'),
  ('ciro',          'Conquista di Babilonia',     'SRID=4326;LINESTRING(53.0 30.0, 48.5 32.0, 44.42 32.54)'),
  ('dario',         'Prima guerra persiana',      'SRID=4326;LINESTRING(52.5 29.6, 44.0 35.0, 26.5 40.0, 23.96 38.15)'),
  ('serse',         'Seconda guerra persiana',    'SRID=4326;LINESTRING(52.5 29.6, 40.0 39.0, 26.4 40.15, 22.54 38.80, 23.50 37.96)'),
  ('leonida',       'Le Termopili',               'SRID=4326;LINESTRING(22.43 37.07, 22.54 38.80)'),
  ('temistocle',    'Salamina',                   'SRID=4326;LINESTRING(23.73 37.98, 23.50 37.96)'),
  ('alessandro',    'Conquista dell''Asia',       'SRID=4326;LINESTRING(22.95 40.63, 36.0 36.0, 44.42 33.31, 68.0 30.0)'),
  ('annibale',      'Seconda guerra punica',      'SRID=4326;LINESTRING(3.0 42.0, 7.0 45.0, 11.0 44.5, 16.13 41.30)'),
  ('amilcare',      'Espansione in Iberia',       'SRID=4326;LINESTRING(10.3 36.8, 3.0 39.0, -0.5 38.0)'),
  ('scipione',      'Battaglia di Zama',          'SRID=4326;LINESTRING(12.4 41.9, 10.0 37.5, 9.4 36.3)'),
  ('cesare',        'Guerra Gallica',             'SRID=4326;LINESTRING(2.35 48.85, 4.83 45.76, 6.0 47.0)'),
  ('traiano',       'Guerre daciche',             'SRID=4326;LINESTRING(20.0 44.0, 21.9 45.0, 22.9 45.62)'),
  ('augusto',       'Battaglia di Azio',          'SRID=4326;LINESTRING(12.4 41.9, 17.0 40.0, 20.9 38.9)'),
  ('maometto',      'Unificazione dell''Arabia',  'SRID=4326;LINESTRING(39.82 21.42, 39.6 24.47)'),
  ('khalid',        'Conquista della Siria',      'SRID=4326;LINESTRING(39.6 24.47, 37.0 31.0, 36.05 32.73)'),
  ('saladino',      'Riconquista di Gerusalemme', 'SRID=4326;LINESTRING(44.4 33.3, 38.0 33.5, 35.23 31.78)'),
  ('carlomagno',    'Espansione carolingia',      'SRID=4326;LINESTRING(6.08 50.77, 9.15 45.18, 12.5 41.9)'),
  ('martello',      'Battaglia di Poitiers',      'SRID=4326;LINESTRING(-1.0 43.0, 0.34 46.58)'),
  ('goffredo',      'Prima Crociata',             'SRID=4326;LINESTRING(4.85 45.75, 19.0 47.5, 26.4 40.15, 35.23 31.78)'),
  ('riccardo',      'Terza Crociata',             'SRID=4326;LINESTRING(-1.5 47.0, 14.5 40.8, 35.0 32.9)'),
  ('gengis',        'Conquiste mongole',          'SRID=4326;LINESTRING(106.92 47.92, 90.0 44.0, 60.0 40.0)'),
  ('subotai',       'Invasione dell''Europa',     'SRID=4326;LINESTRING(90.0 48.0, 50.0 50.0, 21.0 47.0, 19.04 47.50)'),
  ('kublai',        'Conquista della Cina',       'SRID=4326;LINESTRING(106.92 47.92, 116.40 39.90)'),
  ('maomettoii',    'Caduta di Costantinopoli',   'SRID=4326;LINESTRING(29.1 40.2, 28.98 41.01)'),
  ('solimano',      'Avanzata nei Balcani',       'SRID=4326;LINESTRING(28.98 41.01, 20.0 45.0, 16.37 48.20)'),
  ('colombo',       'Scoperta dell''America',     'SRID=4326;LINESTRING(-6.3 36.0, -40.0 28.0, -74.0 23.0)'),
  ('cortes',        'Conquista degli Aztechi',    'SRID=4326;LINESTRING(-96.1 19.2, -98.0 19.3, -99.13 19.43)'),
  ('pizarro',       'Conquista degli Inca',       'SRID=4326;LINESTRING(-79.0 -8.0, -75.0 -11.0, -71.97 -13.53)'),
  ('napoleone_it',  'Campagna d''Italia',         'SRID=4326;LINESTRING(11.50 45.60, 11.62 45.68, 11.75 45.77)'),
  ('napoleone_eg',  'Campagna d''Egitto',         'SRID=4326;LINESTRING(5.37 43.30, 20.0 34.0, 31.2 30.0)'),
  ('napoleone_ru',  'Campagna di Russia',         'SRID=4326;LINESTRING(23.0 54.0, 31.0 55.0, 37.62 55.75)'),
  ('napoleone_wa',  'Waterloo',                   'SRID=4326;LINESTRING(2.35 48.85, 4.40 50.68)'),
  ('pietro',        'Grande guerra del Nord',     'SRID=4326;LINESTRING(30.31 59.94, 34.55 49.59)'),
  ('kutuzov',       'Resistenza a Napoleone',     'SRID=4326;LINESTRING(35.82 55.51, 37.62 55.75)'),
  ('garibaldi',     'Spedizione dei Mille',       'SRID=4326;LINESTRING(12.43 37.80, 13.36 38.11, 14.25 40.85)'),
  ('grande_guerra', 'Fronte dell''Isonzo',        'SRID=4326;LINESTRING(13.55 45.95, 12.70 45.90, 11.80 45.87)'),
  ('normandia',     'Sbarco in Normandia',        'SRID=4326;LINESTRING(-1.10 49.30, 0.5 49.2, 2.35 48.85)'),
  ('seconda_guerra','Linea Gotica',               'SRID=4326;LINESTRING(15.09 37.08, 12.6 41.9, 10.30 44.10, 11.34 44.49)')
) as v(cmd_slug, title, g)
join public.commanders c on c.slug = v.cmd_slug
where not exists (select 1 from public.routes r where r.commander_id = c.id);

-- Un segmento attestato con fonte per ogni percorso senza segmenti.
insert into public.route_segments (route_id, seq, geom, certainty, importance, sources)
select r.id, 1, r.geom, 'attestato', 3, '[{"cit":"Fonte storica di riferimento"}]'::jsonb
from public.routes r
where not exists (select 1 from public.route_segments s where s.route_id = r.id);
