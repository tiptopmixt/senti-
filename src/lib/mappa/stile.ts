import type { StyleSpecification } from "maplibre-gl";

/**
 * Stile "carta antica" per MapLibre.
 *
 * Due strati separati, come richiesto dal progetto:
 *  - il FONDO (acqua, boschi, rilievo, strade) in toni di pergamena, tenue;
 *  - le ETICHETTE sopra, in carattere ad alto contrasto, con densità che
 *    cresce con lo zoom: da lontano solo le città, poi i paesi, poi le frazioni.
 *
 * Il fondo non deve mai gridare più forte dei percorsi e delle memorie: quelli
 * sono il contenuto, la cartografia è il contesto.
 */

// Sorgente delle tessere. Configurabile: vedi la nota in fondo al file.
const SORGENTE_TILES =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ?? "https://tiles.openfreemap.org/planet";
const SORGENTE_FONTS =
  process.env.NEXT_PUBLIC_MAP_FONTS_URL ??
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// Palette pergamena.
const CARTA = "#f0e5cc";
const CARTA_SCURA = "#e5d6b4";
const ACQUA = "#c3d0cf";
const BOSCO = "#dcdcb8";
const STRADA = "#c9b48c";
const INCHIOSTRO = "#2f2415";
const INCHIOSTRO_TENUE = "#7a6440";

/** Colori della certezza: la stessa scala usata per le linee dei percorsi. */
export const COLORI_CERTEZZA = {
  attestato: "#5c3a1e",
  probabile: "#8a6034",
  ipotetico: "#a98a63",
} as const;

/**
 * Tratteggio per grado di certezza. La certezza è un dato visibile:
 *  - attestato  → linea continua
 *  - probabile  → tratteggiata
 *  - ipotetico  → punteggiata
 */
export const TRATTEGGIO_CERTEZZA: Record<string, number[] | undefined> = {
  attestato: undefined,
  probabile: [2, 1.5],
  ipotetico: [0.4, 1.8],
};

export function stileCartaAntica(): StyleSpecification {
  return {
    version: 8,
    glyphs: SORGENTE_FONTS,
    sources: {
      base: {
        type: "vector",
        url: SORGENTE_TILES,
      },
    },
    layers: [
      // --- Fondo -------------------------------------------------------------
      {
        id: "sfondo",
        type: "background",
        paint: { "background-color": CARTA },
      },
      {
        id: "terreno",
        type: "fill",
        source: "base",
        "source-layer": "landcover",
        paint: { "fill-color": BOSCO, "fill-opacity": 0.45 },
      },
      {
        id: "uso-suolo",
        type: "fill",
        source: "base",
        "source-layer": "landuse",
        paint: { "fill-color": CARTA_SCURA, "fill-opacity": 0.5 },
      },
      {
        id: "acqua",
        type: "fill",
        source: "base",
        "source-layer": "water",
        paint: { "fill-color": ACQUA, "fill-opacity": 0.85 },
      },
      {
        id: "corsi-acqua",
        type: "line",
        source: "base",
        "source-layer": "waterway",
        paint: {
          "line-color": ACQUA,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 2.2],
        },
      },
      {
        id: "strade",
        type: "line",
        source: "base",
        "source-layer": "transportation",
        minzoom: 9,
        paint: {
          "line-color": STRADA,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 16, 2.5],
          "line-opacity": 0.75,
        },
      },
      {
        id: "edifici",
        type: "fill",
        source: "base",
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": CARTA_SCURA, "fill-opacity": 0.7 },
      },

      // --- Etichette: strato separato, densità crescente ---------------------
      // Da lontano solo i centri maggiori: Vicenza, Padova, Trento, Bassano.
      {
        id: "etichette-citta",
        type: "symbol",
        source: "base",
        "source-layer": "place",
        minzoom: 5,
        filter: ["in", ["get", "class"], ["literal", ["city"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 15],
          "text-letter-spacing": 0.08,
          "text-max-width": 7,
        },
        paint: {
          "text-color": INCHIOSTRO,
          "text-halo-color": CARTA,
          "text-halo-width": 1.6,
        },
      },
      {
        id: "etichette-paesi",
        type: "symbol",
        source: "base",
        "source-layer": "place",
        minzoom: 9,
        filter: ["in", ["get", "class"], ["literal", ["town"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 13],
          "text-letter-spacing": 0.05,
          "text-max-width": 8,
        },
        paint: {
          "text-color": INCHIOSTRO,
          "text-halo-color": CARTA,
          "text-halo-width": 1.4,
        },
      },
      {
        id: "etichette-frazioni",
        type: "symbol",
        source: "base",
        "source-layer": "place",
        minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["village", "hamlet", "suburb"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 16, 12],
          "text-max-width": 8,
        },
        paint: {
          "text-color": INCHIOSTRO_TENUE,
          "text-halo-color": CARTA,
          "text-halo-width": 1.2,
        },
      },
    ],
  };
}

/**
 * Se le tessere non sono configurate o non rispondono, la mappa non deve
 * restare bianca: resta la pergamena, e sopra si vedono comunque percorsi e
 * memorie, che sono il contenuto vero dell'applicazione.
 */
export function stileSoloPergamena(): StyleSpecification {
  return {
    version: 8,
    glyphs: SORGENTE_FONTS,
    sources: {},
    layers: [
      { id: "sfondo", type: "background", paint: { "background-color": CARTA } },
    ],
  };
}
