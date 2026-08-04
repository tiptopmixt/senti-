#!/usr/bin/env node
/**
 * import-battles.mjs — Importa battaglie storiche europee da Wikidata.
 *
 * Esegue query SPARQL con soglie differenziate per regione:
 *   Francia/UK/Italia: >= 20 sitelinks
 *   Europa dell'Est:   >= 12 sitelinks
 *   Resto d'Europa:    >= 30 sitelinks
 *
 * Genera un file SQL con INSERT per Supabase.
 * Uso:  node scripts/import-battles.mjs
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "supabase", "seed", "battles_seed.sql");
const SPARQL = "https://query.wikidata.org/sparql";

// ── Soglie per regione ─────────────────────────────────────────────────────
const FR_UK_IT = new Set([
  "Francia", "Regno di Francia", "Primo Impero francese",
  "Secondo Impero francese", "Francia di Vichy",
  "Regno Unito", "Regno d'Inghilterra", "Regno di Scozia", "Galles",
  "Gran Bretagna", "Regno Unito di Gran Bretagna e Irlanda",
  "Italia", "antica Roma", "Impero romano", "Impero romano d'Occidente",
  "Regno di Sardegna", "Repubblica di Venezia", "Ducato di Milano",
  "Regno delle Due Sicilie", "Stato Pontificio", "Regno d'Italia",
  "Spagna", "Regno di Spagna", "Corona d'Aragona", "Corona di Castiglia",
  "Germania", "Sacro Romano Impero", "Regno di Prussia", "Confederazione germanica",
  "Belgio", "Paesi Bassi", "Repubblica delle Sette Province Unite",
  "Regno Uniti dei Paesi Bassi", "Portogallo", "Regno del Portogallo",
  "Austria", "Impero austriaco", "Monarchia asburgica", "Austria-Ungheria",
  "Svizzera", "Svezia", "Danimarca", "Norvegia", "Finlandia",
  "Irlanda", "Regno d'Irlanda",
]);

const EAST = new Set([
  "Romania", "Moldavia", "Principato di Moldavia", "Valacchia",
  "Ungheria", "Kingdom of Hungary", "Regno d'Ungheria",
  "Bulgaria", "Primo Impero bulgaro", "Secondo Impero bulgaro",
  "Polonia", "Regno di Polonia", "Confederazione polacco-lituana",
  "Ucraina", "Unione Sovietica", "Russia", "Impero russo",
  "Grecia", "Turchia", "Impero ottomano", "Impero bizantino",
  "Serbia", "Croazia", "Bosnia ed Erzegovina",
  "Albania", "Macedonia del Nord", "Montenegro", "Kosovo",
  "Repubblica Ceca", "Boemia", "Moravia",
  "Slovacchia", "Lituania", "Lettonia", "Estonia", "Bielorussia",
  "Impero achemenide", "Granducato di Lituania",
  "Grecia ottomana", "Civiltà cartaginese",
]);

function threshold(country) {
  if (EAST.has(country)) return 12;
  if (FR_UK_IT.has(country)) return 20;
  return 30;
}

// ── Normalizzazione paese ──────────────────────────────────────────────────
const NORM = {
  "Regno di Francia": "Francia",
  "Primo Impero francese": "Francia",
  "Secondo Impero francese": "Francia",
  "Francia di Vichy": "Francia",
  "Regno d'Inghilterra": "Regno Unito",
  "Regno di Scozia": "Regno Unito",
  "Galles": "Regno Unito",
  "Gran Bretagna": "Regno Unito",
  "Regno Unito di Gran Bretagna e Irlanda": "Regno Unito",
  "antica Roma": "Italia",
  "Impero romano": "Italia",
  "Impero romano d'Occidente": "Italia",
  "Regno di Sardegna": "Italia",
  "Repubblica di Venezia": "Italia",
  "Ducato di Milano": "Italia",
  "Regno delle Due Sicilie": "Italia",
  "Stato Pontificio": "Italia",
  "Regno d'Italia": "Italia",
  "Regno di Spagna": "Spagna",
  "Corona d'Aragona": "Spagna",
  "Corona di Castiglia": "Spagna",
  "Crown of Aragon": "Spagna",
  "Sacro Romano Impero": "Germania",
  "Regno di Prussia": "Germania",
  "Confederazione germanica": "Germania",
  "Principato di Moldavia": "Romania",
  "Valacchia": "Romania",
  "Kingdom of Hungary": "Ungheria",
  "Regno d'Ungheria": "Ungheria",
  "Regno di Polonia": "Polonia",
  "Confederazione polacco-lituana": "Polonia",
  "Primo Impero bulgaro": "Bulgaria",
  "Secondo Impero bulgaro": "Bulgaria",
  "Impero ottomano": "Turchia",
  "Impero bizantino": "Turchia",
  "Impero achemenide": "Turchia",
  "Boemia": "Repubblica Ceca",
  "Moravia": "Repubblica Ceca",
  "Granducato di Lituania": "Lituania",
  "Impero russo": "Russia",
  "Unione Sovietica": "Russia",
  "Repubblica delle Sette Province Unite": "Paesi Bassi",
  "Regno Uniti dei Paesi Bassi": "Belgio",
  "Impero austriaco": "Austria",
  "Monarchia asburgica": "Austria",
  "Austria-Ungheria": "Austria",
  "Regno del Portogallo": "Portogallo",
  "Regno d'Irlanda": "Irlanda",
  "Grecia ottomana": "Grecia",
  "Civiltà cartaginese": "Tunisia",
  "stato monastico dei Cavalieri di Malta": "Malta",
  "Gallia": "Francia",
  "Regno franco": "Francia",
  "Regno di Soissons": "Francia",
  "Prussia": "Germania",
  "Regno di Sassonia": "Germania",
  "Reich tedesco": "Germania",
  "Sultanato di Rum": "Turchia",
  "Impero latino": "Turchia",
  "Impero di Nicea": "Turchia",
  "Roman Asia Minor": "Turchia",
  "Regno armeno di Cilicia": "Turchia",
  "Impero safavide": "Turchia",
  "Impero sasanide": "Turchia",
  "Regno di Boemia": "Repubblica Ceca",
  "Moscovia": "Russia",
  "Novgorodian Land": "Russia",
  "Impero svedese": "Svezia",
  "Regno di Gran Bretagna": "Regno Unito",
  "Commonwealth d'Inghilterra": "Regno Unito",
  "Spanish Republic at War": "Spagna",
  "Hispania Ulterior": "Spagna",
  "Regno delle Asturie": "Spagna",
  "Regno visigoto": "Spagna",
  "Almohadi": "Spagna",
  "dinastia sa'diana": "Spagna",
  "Regno di Castiglia e León": "Spagna",
  "Secondo impero bulgaro": "Bulgaria",
  "primo impero bulgaro": "Bulgaria",
  "Repubblica Popolare Ucraina": "Ucraina",
  "Seconda Repubblica di Polonia": "Polonia",
  "Libera Città di Danzica": "Polonia",
  "Kingdom of Hungary (1000–1301)": "Ungheria",
  "Despotato di Serbia": "Serbia",
  "Repubblica di Bosnia ed Erzegovina": "Bosnia ed Erzegovina",
  "Paesi Bassi spagnoli": "Belgio",
  "Lombardia austriaca": "Italia",
  "Tespie": "Grecia",
  "antica Grecia": "Grecia",
  "Regno di Dublino": "Irlanda",
  "Dacia": "Romania",
  "Regno di Georgia": "Georgia",
  "Repubblica Socialista Sovietica Azera": "Azerbaijan",
};

function normalizeCountry(raw) {
  return NORM[raw] ?? raw;
}

// ── Periodo storico ────────────────────────────────────────────────────────
function classifyPeriod(year) {
  if (year === null) return "medioevo";
  if (year < 476) return "antichita";
  if (year < 1453) return "medioevo";
  if (year < 1789) return "eta_moderna";
  if (year <= 1815) return "napoleonico";
  if (year < 1914) return "ottocento";
  if (year <= 1918) return "prima_guerra";
  if (year >= 1939 && year <= 1945) return "seconda_guerra";
  return "contemporaneo";
}

// ── Parsing ────────────────────────────────────────────────────────────────
function extractQID(uri) {
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : null;
}

function parseCoord(wkt) {
  const m = wkt.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(-?\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

const MESI = [
  "", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function formatDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(-?\d+)-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (year < 0) {
    if (day > 1 && month > 0) return `${day} ${MESI[month]} ${Math.abs(year)} a.C.`;
    return `${Math.abs(year)} a.C.`;
  }
  if (day === 1 && month === 1) return `${year}`;
  if (month > 0 && month <= 12) return `${day} ${MESI[month]} ${year}`;
  return `${year}`;
}

function escSQL(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

// ── SPARQL ─────────────────────────────────────────────────────────────────
async function sparql(q) {
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "SentiApp/1.0 (https://github.com/tiptopmixt/senti-)",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SPARQL ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.results.bindings;
}

async function fetchBattles() {
  console.log("→ Query SPARQL: battaglie europee con coordinate e sitelinks >= 12 ...");
  const q = `
SELECT ?battle ?battleLabel ?coord ?date ?countryLabel ?sitelinks ?wp
WHERE {
  ?battle wdt:P31/wdt:P279* wd:Q178561 .
  ?battle wdt:P625 ?coord .
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  FILTER(?lat > 34 && ?lat < 72 && ?lon > -25 && ?lon < 50)
  ?battle wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 12)
  OPTIONAL { ?battle wdt:P585 ?date }
  OPTIONAL { ?battle wdt:P17 ?country }
  OPTIONAL { ?wp schema:about ?battle ; schema:isPartOf <https://it.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" }
}
ORDER BY DESC(?sitelinks)
`;
  return sparql(q);
}

async function fetchParticipants() {
  console.log("→ Query SPARQL: schieramenti (battaglie con sitelinks >= 40) ...");
  const q = `
SELECT ?battle ?partLabel
WHERE {
  ?battle wdt:P31/wdt:P279* wd:Q178561 .
  ?battle wdt:P625 ?coord .
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  FILTER(?lat > 34 && ?lat < 72 && ?lon > -25 && ?lon < 50)
  ?battle wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 40)
  ?battle wdt:P710 ?part .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" }
}
`;
  try {
    const rows = await sparql(q);
    const grouped = new Map();
    for (const r of rows) {
      const qid = extractQID(r.battle.value);
      const label = r.partLabel?.value;
      if (!qid || !label) continue;
      if (!grouped.has(qid)) grouped.set(qid, new Set());
      grouped.get(qid).add(label);
    }
    return [...grouped.entries()].map(([qid, parts]) => ({
      battle: { value: `http://www.wikidata.org/entity/${qid}` },
      parts: { value: [...parts].join("|") },
    }));
  } catch (e) {
    console.warn("  ⚠ Query schieramenti fallita, procedo senza:", e.message);
    return [];
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const rows = await fetchBattles();
  console.log(`  ${rows.length} righe SPARQL ricevute`);

  // Raggruppa per Q-ID (deduplicazione)
  const map = new Map();
  for (const r of rows) {
    const qid = extractQID(r.battle.value);
    if (!qid) continue;
    const coord = parseCoord(r.coord.value);
    if (!coord) continue;

    if (map.has(qid)) {
      const e = map.get(qid);
      if (r.countryLabel?.value) e.countries.add(r.countryLabel.value);
      if (r.date?.value && !e.date) e.date = r.date.value;
      if (r.wp?.value && !e.wpUrl) e.wpUrl = r.wp.value;
    } else {
      map.set(qid, {
        qid,
        name: r.battleLabel.value,
        coord,
        date: r.date?.value ?? null,
        countries: new Set(r.countryLabel?.value ? [r.countryLabel.value] : []),
        sitelinks: parseInt(r.sitelinks.value, 10),
        wpUrl: r.wp?.value ?? null,
      });
    }
  }
  console.log(`  ${map.size} battaglie uniche dopo deduplicazione`);

  // Applica soglia per paese
  const filtered = [];
  for (const b of map.values()) {
    const countries = [...b.countries];
    const minThreshold = countries.length > 0
      ? Math.min(...countries.map(threshold))
      : 30;
    if (b.sitelinks >= minThreshold) {
      filtered.push(b);
    }
  }
  console.log(`  ${filtered.length} battaglie dopo filtro soglie per regione`);

  // Schieramenti
  const partRows = await fetchParticipants();
  const partMap = new Map();
  for (const r of partRows) {
    const qid = extractQID(r.battle.value);
    if (qid && r.parts?.value) {
      partMap.set(qid, r.parts.value.split("|").map((s) => s.trim()).filter(Boolean));
    }
  }
  console.log(`  ${partMap.size} battaglie con schieramenti`);

  // Genera SQL
  const lines = [
    "-- Battaglie storiche europee importate da Wikidata",
    `-- Generato il ${new Date().toISOString().slice(0, 10)}`,
    `-- Totale: ${filtered.length} battaglie`,
    "",
    "INSERT INTO public.historical_battles",
    "  (name, event_date, event_year, period, country, geog, belligerents, sitelinks, wikidata_id, wikipedia_url)",
    "VALUES",
  ];

  const values = [];
  const countryCounts = {};

  for (const b of filtered) {
    const year = parseYear(b.date);
    const period = classifyPeriod(year);
    const countries = [...b.countries];
    const country = normalizeCountry(countries[0] ?? "Sconosciuto");
    const eventDate = formatDate(b.date);
    const parts = partMap.get(b.qid);
    const belligerents = parts && parts.length > 0
      ? `ARRAY[${parts.map(escSQL).join(",")}]`
      : "NULL";
    const wpUrl = b.wpUrl ?? `https://www.wikidata.org/wiki/${b.qid}`;

    countryCounts[country] = (countryCounts[country] ?? 0) + 1;

    values.push(
      `  (${escSQL(b.name)}, ${escSQL(eventDate)}, ${year ?? "NULL"}, ` +
      `'${period}', ${escSQL(country)}, ` +
      `st_setsrid(st_point(${b.coord.lon}, ${b.coord.lat}), 4326)::geography, ` +
      `${belligerents}, ${b.sitelinks}, ${escSQL(b.qid)}, ${escSQL(wpUrl)})`
    );
  }

  lines.push(values.join(",\n"));
  lines.push("ON CONFLICT (wikidata_id) DO NOTHING;");

  // Statistiche
  lines.push("");
  lines.push("-- Statistiche per paese:");
  const sorted = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of sorted) {
    lines.push(`--   ${c}: ${n}`);
  }

  // Statistiche per periodo
  const periodCounts = {};
  for (const b of filtered) {
    const year = parseYear(b.date);
    const period = classifyPeriod(year);
    periodCounts[period] = (periodCounts[period] ?? 0) + 1;
  }
  lines.push("-- Statistiche per periodo:");
  for (const [p, n] of Object.entries(periodCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`--   ${p}: ${n}`);
  }

  const sql = lines.join("\n") + "\n";

  // Crea la directory seed se non esiste
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(__dirname, "..", "supabase", "seed"), { recursive: true });

  writeFileSync(OUT, sql, "utf-8");
  console.log(`\n✓ File generato: ${OUT}`);
  console.log(`  ${filtered.length} battaglie totali`);
  console.log(`  Per paese: ${sorted.slice(0, 10).map(([c, n]) => `${c} ${n}`).join(", ")}`);
}

main().catch((e) => {
  console.error("ERRORE:", e);
  process.exit(1);
});
