"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  COLORI_CERTEZZA,
  TRATTEGGIO_CERTEZZA,
  stileCartaAntica,
} from "@/lib/mappa/stile";
import {
  condottieri,
  imperi,
  luoghiPubblici,
  luoghiVicini,
  percorsi,
  segmentiPercorsi,
  type Condottiero,
  type Impero,
  type LuogoVicino,
  type Percorso,
  type Segmento,
} from "@/lib/queries/mappa";
import { FINDING_EMOJI, type FindingType } from "@/lib/validation";
import { useRouter } from "@/i18n/navigation";
import { ColonnaTempo } from "./ColonnaTempo";
import styles from "./Mappa.module.css";

// Vista mondiale: le campagne sono sparse in tutto il mondo.
const CENTRO: [number, number] = [12, 35];
const ZOOM = 1.6;

const CERTEZZE = ["attestato", "probabile", "ipotetico"] as const;

interface PuntoNuovo {
  lon: number;
  lat: number;
  vicini: LuogoVicino[];
}

/**
 * La mappa mondiale: percorsi delle campagne con la certezza visibile, pin dei
 * ritrovamenti con l'icona della categoria, e un filtro per condottiero.
 *
 * Il criterio che guida tutto: la cartografia è contesto, i percorsi e i
 * ritrovamenti sono il contenuto. Il fondo non deve mai gridare più forte.
 */
export function Mappa() {
  const t = useTranslations("mappa");
  const router = useRouter();
  const contenitoreRef = useRef<HTMLDivElement | null>(null);
  const mappaRef = useRef<MapLibreMap | null>(null);
  const segmentiRef = useRef<Segmento[]>([]);
  // Condottieri per id, letti dal gestore di click sulle icone "info".
  const condottieriMapRef = useRef<Map<string, Condottiero>>(new Map());

  const [pronta, setPronta] = useState(false);
  const [listaCondottieri, setListaCondottieri] = useState<Condottiero[]>([]);
  const [listaImperi, setListaImperi] = useState<Impero[]>([]);
  const [listaPercorsi, setListaPercorsi] = useState<Percorso[]>([]);
  // "" = tutti · "empire:<id>" = intero impero · "<id>" = singolo condottiero
  const [selezione, setSelezione] = useState<string>("");
  const [puntoNuovo, setPuntoNuovo] = useState<PuntoNuovo | null>(null);
  const [puntoTempo, setPuntoTempo] = useState<{ lon: number; lat: number; nome?: string; poiId?: string } | null>(null);
  const [infoCampagna, setInfoCampagna] = useState<Condottiero | null>(null);
  const [infoImpero, setInfoImpero] = useState<Impero | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  /** Apre il pannello "nuovo ritrovamento", ma prima controlla i doppioni vicini. */
  const proponiLuogo = useCallback(async (lon: number, lat: number) => {
    setMessaggio(null);
    let vicini: LuogoVicino[] = [];
    try {
      vicini = await luoghiVicini(lon, lat, 100);
    } catch {
      // Senza rete si può comunque proporre: il doppione è un male minore.
    }
    setPuntoNuovo({ lon, lat, vicini });
  }, []);

  // --- Inizializzazione della mappa ------------------------------------------
  useEffect(() => {
    if (!contenitoreRef.current || mappaRef.current) return;

    let annullato = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const annullaTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    void (async () => {
      const { Map, NavigationControl } = await import("maplibre-gl");
      if (annullato || !contenitoreRef.current) return;

      const mappa = new Map({
        container: contenitoreRef.current,
        style: stileCartaAntica(),
        center: CENTRO,
        zoom: ZOOM,
        attributionControl: { compact: true },
      });
      mappaRef.current = mappa;
      mappa.addControl(new NavigationControl({ showCompass: false }), "top-right");

      if (process.env.NODE_ENV === "development") {
        (window as unknown as { mappaSenti?: MapLibreMap }).mappaSenti = mappa;
      }
      mappa.on("error", (e) => console.error("[mappa] errore:", e.error?.message ?? e));

      mappa.on("load", () => {
        void caricaDati(mappa, (segs) => {
          segmentiRef.current = segs;
        });
        setPronta(true);
      });

      // Tocco lungo (mobile) / tasto destro (desktop): "aggiungi qui".
      let mosso = false;
      mappa.on("touchstart", (e) => {
        mosso = false;
        annullaTimer();
        timer = setTimeout(() => {
          if (!mosso) void proponiLuogo(e.lngLat.lng, e.lngLat.lat);
        }, 600);
      });
      mappa.on("touchmove", () => {
        mosso = true;
        annullaTimer();
      });
      mappa.on("touchend", annullaTimer);
      mappa.on("contextmenu", (e) => void proponiLuogo(e.lngLat.lng, e.lngLat.lat));

      // Tocco su un pin: apre la sua colonna del tempo.
      mappa.on("click", (e) => {
        // Prima l'icona "info" della campagna, se presente sotto il tocco.
        const info = mappa.queryRenderedFeatures(e.point, { layers: ["campagna-info"] });
        if (info.length > 0) {
          const cid = info[0].properties?.commander_id as string | undefined;
          const c = cid ? condottieriMapRef.current.get(cid) : null;
          if (c) setInfoCampagna(c);
          return;
        }
        // Tocco su un gruppo (cluster): zooma per aprirlo.
        const gruppi = mappa.queryRenderedFeatures(e.point, { layers: ["ritrovamenti-cluster"] });
        if (gruppi.length > 0 && gruppi[0].geometry.type === "Point") {
          const clusterId = gruppi[0].properties?.cluster_id as number;
          const src = mappa.getSource("ritrovamenti") as GeoJSONSource;
          const centro = gruppi[0].geometry.coordinates as [number, number];
          void src.getClusterExpansionZoom(clusterId).then((z) => {
            mappa.easeTo({ center: centro, zoom: z, duration: 600 });
          });
          return;
        }
        const trovati = mappa.queryRenderedFeatures(e.point, { layers: ["ritrovamenti"] });
        const f = trovati[0];
        if (f && f.geometry.type === "Point") {
          const [lon, lat] = f.geometry.coordinates;
          setPuntoTempo({
            lon,
            lat,
            nome: f.properties?.name as string | undefined,
            poiId: f.properties?.id as string | undefined,
          });
        }
      });
      for (const layer of ["ritrovamenti", "ritrovamenti-cluster", "campagna-info"]) {
        mappa.on("mouseenter", layer, () => {
          mappa.getCanvas().style.cursor = "pointer";
        });
        mappa.on("mouseleave", layer, () => {
          mappa.getCanvas().style.cursor = "";
        });
      }
    })();

    return () => {
      annullato = true;
      annullaTimer();
      mappaRef.current?.remove();
      mappaRef.current = null;
    };
  }, [proponiLuogo]);

  // Carica gli elenchi per il filtro (imperi + condottieri + percorsi).
  useEffect(() => {
    void condottieri()
      .then((cs) => {
        setListaCondottieri(cs);
        condottieriMapRef.current = new Map(cs.map((c) => [c.id, c]));
      })
      .catch(() => {});
    void imperi().then(setListaImperi).catch(() => {});
    void percorsi().then(setListaPercorsi).catch(() => {});
  }, []);

  // Condottieri raggruppati per impero (per il menu a due livelli).
  const condottieriPerImpero = useMemo(() => {
    const m = new Map<string, Condottiero[]>();
    for (const c of listaCondottieri) {
      const k = c.empire_id ?? "_";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return m;
  }, [listaCondottieri]);

  // I route_id visibili in base alla selezione (intero impero o singolo condottiero).
  const routeIdsVisibili = useMemo(() => {
    if (!selezione) return null; // tutti
    let commanderIds: Set<string>;
    if (selezione.startsWith("empire:")) {
      const eid = selezione.slice("empire:".length);
      commanderIds = new Set(listaCondottieri.filter((c) => c.empire_id === eid).map((c) => c.id));
    } else {
      commanderIds = new Set([selezione]);
    }
    return listaPercorsi.filter((p) => p.commander_id && commanderIds.has(p.commander_id)).map((p) => p.id);
  }, [selezione, listaPercorsi, listaCondottieri]);

  // Impero selezionato (per il pulsante "scheda impero").
  const imperoSel = useMemo(() => {
    if (!selezione.startsWith("empire:")) return null;
    const eid = selezione.slice("empire:".length);
    return listaImperi.find((i) => i.id === eid) ?? null;
  }, [selezione, listaImperi]);

  // --- Filtro condottiero: mostra solo i percorsi del condottiero scelto e
  //     centra la mappa sulla campagna (Europa → Asia, il mondo si sposta). ---
  useEffect(() => {
    const mappa = mappaRef.current;
    if (!mappa || !pronta) return;

    // Filtro dei livelli percorso.
    for (const c of CERTEZZE) {
      const id = `percorsi-${c}`;
      if (!mappa.getLayer(id)) continue;
      mappa.setFilter(
        id,
        routeIdsVisibili === null
          ? null
          : ["in", ["get", "route_id"], ["literal", routeIdsVisibili]],
      );
    }

    const infoSrc = mappa.getSource("campagna-info") as GeoJSONSource | undefined;

    // Nessuna selezione: vista mondiale e nessuna icona info.
    if (routeIdsVisibili === null) {
      infoSrc?.setData({ type: "FeatureCollection", features: [] });
      mappa.flyTo({ center: CENTRO, zoom: ZOOM, duration: 1200 });
      return;
    }

    // route_id → commander_id (per collegare ogni icona info alla sua campagna).
    const routeToCmd = new Map(listaPercorsi.map((p) => [p.id, p.commander_id]));
    // route_id → punto d'inizio (segmento con seq minore).
    const inizioPerRoute = new Map<string, { pt: [number, number]; seq: number }>();
    const visibili = new Set(routeIdsVisibili);
    let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90, trovati = 0;

    for (const s of segmentiRef.current) {
      if (!visibili.has(s.route_id)) continue;
      const coords = s.geojson.coordinates;
      if (coords.length === 0) continue;
      const prec = inizioPerRoute.get(s.route_id);
      if (!prec || s.seq < prec.seq) {
        inizioPerRoute.set(s.route_id, { pt: coords[0], seq: s.seq });
      }
      for (const [lon, lat] of coords) {
        trovati++;
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }

    // Un'icona "info" all'inizio di ogni campagna visibile.
    const feats: GeoJSON.Feature[] = [];
    for (const [routeId, { pt }] of inizioPerRoute) {
      const cmd = routeToCmd.get(routeId);
      if (!cmd) continue;
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pt },
        properties: { commander_id: cmd },
      });
    }
    infoSrc?.setData({ type: "FeatureCollection", features: feats });

    if (trovati > 0) {
      mappa.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 80, maxZoom: 9, duration: 1400 },
      );
    }
  }, [routeIdsVisibili, pronta, listaPercorsi]);

  // --- "Sono qui": GPS -------------------------------------------------------
  function sonoQui() {
    setMessaggio(null);
    if (!navigator.geolocation) {
      setMessaggio(t("errori.gpsNonDisponibile"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        mappaRef.current?.flyTo({ center: [longitude, latitude], zoom: 14 });
        void proponiLuogo(longitude, latitude);
      },
      () => setMessaggio(t("errori.gpsNegato")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /** Va al form "aggiungi ritrovamento" con le coordinate scelte. */
  function aggiungiQui() {
    if (!puntoNuovo) return;
    router.push(`/racconta?lon=${puntoNuovo.lon}&lat=${puntoNuovo.lat}`);
  }

  return (
    <div className={styles.contenitore}>
      <div ref={contenitoreRef} className={styles.mappa} />

      {/* Filtro a due livelli: impero → condottieri. */}
      <div className={styles.filtri}>
        <select
          className={styles.filtroAttivo}
          value={selezione}
          onChange={(e) => setSelezione(e.target.value)}
          aria-label={t("filtri.condottiero")}
        >
          <option value="">{t("filtri.tutti")}</option>
          {listaImperi.map((imp) => (
            <optgroup key={imp.id} label={imp.name}>
              <option value={`empire:${imp.id}`}>{t("filtri.tuttoImpero", { nome: imp.name })}</option>
              {(condottieriPerImpero.get(imp.id) ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {"  "}
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {imperoSel && (
          <button className={styles.filtro} onClick={() => setInfoImpero(imperoSel)}>
            ℹ️ {t("filtri.schedaImpero")}
          </button>
        )}
      </div>

      {/* Legenda della certezza. */}
      <div className={styles.legenda}>
        <span className={styles.vociLegenda}>
          <i className={styles.lineaAttestato} /> {t("certezza.attestato")}
        </span>
        <span className={styles.vociLegenda}>
          <i className={styles.lineaProbabile} /> {t("certezza.probabile")}
        </span>
        <span className={styles.vociLegenda}>
          <i className={styles.lineaIpotetico} /> {t("certezza.ipotetico")}
        </span>
      </div>

      <button className={styles.sonoQui} onClick={sonoQui}>
        {t("sonoQui")}
      </button>

      <p className={styles.suggerimento}>{t("suggerimentoToccoLungo")}</p>

      {messaggio && <p className={styles.messaggio}>{messaggio}</p>}

      {puntoTempo && (
        <ColonnaTempo
          lon={puntoTempo.lon}
          lat={puntoTempo.lat}
          nomeLuogo={puntoTempo.nome}
          poiId={puntoTempo.poiId}
          onChiudi={() => setPuntoTempo(null)}
        />
      )}

      {/* --- Scheda "info" della campagna --- */}
      {infoCampagna && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <h2 className={styles.titoloPannello}>ℹ️ {infoCampagna.name}</h2>
          {(infoCampagna.epoch || infoCampagna.region) && (
            <p className={styles.testoPannello}>
              {[infoCampagna.epoch, infoCampagna.region].filter(Boolean).join(" · ")}
            </p>
          )}
          {(() => {
            const imp = listaImperi.find((i) => i.id === infoCampagna.empire_id);
            return imp ? (
              <p className={styles.testoPannello}>
                <strong>{t("info.impero")}:</strong> {imp.name}
              </p>
            ) : null;
          })()}
          {infoCampagna.bio && <p className={styles.testoPannello}>{infoCampagna.bio}</p>}

          <ul className={styles.listaVicini}>
            {infoCampagna.combattenti && (
              <li>
                <strong>{t("info.combattenti")}:</strong> {infoCampagna.combattenti}
              </li>
            )}
            {infoCampagna.esito && (
              <li>
                <strong>{t("info.esito")}:</strong> {infoCampagna.esito}
              </li>
            )}
            {infoCampagna.durata && (
              <li>
                <strong>{t("info.durata")}:</strong> {infoCampagna.durata}
              </li>
            )}
          </ul>

          {infoCampagna.source_name && (
            <p className={styles.testoPannello}>
              {t("info.fonte")}:{" "}
              {infoCampagna.source_url ? (
                <a href={infoCampagna.source_url} target="_blank" rel="noopener noreferrer">
                  {infoCampagna.source_name}
                </a>
              ) : (
                infoCampagna.source_name
              )}
            </p>
          )}
          <p className={styles.testoPannello} style={{ opacity: 0.7 }}>{t("info.nota")}</p>

          <div className={styles.azioni}>
            <button className={styles.primario} onClick={() => setInfoCampagna(null)}>
              {t("info.chiudi")}
            </button>
          </div>
        </div>
      )}

      {/* --- Scheda dell'impero --- */}
      {infoImpero && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <h2 className={styles.titoloPannello}>🏛️ {infoImpero.name}</h2>
          {(infoImpero.continent || infoImpero.epoch) && (
            <p className={styles.testoPannello}>
              {[infoImpero.continent, infoImpero.epoch].filter(Boolean).join(" · ")}
            </p>
          )}
          {infoImpero.description && <p className={styles.testoPannello}>{infoImpero.description}</p>}
          <ul className={styles.listaVicini}>
            {infoImpero.epoch && (
              <li>
                <strong>{t("info.durata")}:</strong> {infoImpero.epoch}
              </li>
            )}
            {infoImpero.apogeo && (
              <li>
                <strong>{t("info.apogeo")}:</strong> {infoImpero.apogeo}
              </li>
            )}
          </ul>
          {infoImpero.source_name && (
            <p className={styles.testoPannello}>
              {t("info.fonte")}: {infoImpero.source_name}
            </p>
          )}
          <p className={styles.testoPannello} style={{ opacity: 0.7 }}>{t("info.nota")}</p>
          <div className={styles.azioni}>
            <button className={styles.primario} onClick={() => setInfoImpero(null)}>
              {t("info.chiudi")}
            </button>
          </div>
        </div>
      )}

      {/* --- Pannello nuovo ritrovamento --- */}
      {puntoNuovo && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          {puntoNuovo.vicini.length > 0 ? (
            <>
              <h2 className={styles.titoloPannello}>{t("vicini.titolo")}</h2>
              <p className={styles.testoPannello}>{t("vicini.spiegazione")}</p>
              <ul className={styles.listaVicini}>
                {puntoNuovo.vicini.map((v) => (
                  <li key={v.id}>
                    {FINDING_EMOJI[v.finding_type]} <strong>{v.name}</strong> ·{" "}
                    {Math.round(v.distanza_m)} m
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <h2 className={styles.titoloPannello}>{t("nuovoLuogo.titolo")}</h2>
          )}

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setPuntoNuovo(null)}>
              {t("azioni.annulla")}
            </button>
            <button className={styles.primario} onClick={aggiungiQui}>
              {t("azioni.creaLuogo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Carica ritrovamenti e percorsi e li disegna. `store` riceve i segmenti
 *  caricati, così il componente può calcolare i limiti per il centraggio. */
async function caricaDati(mappa: MapLibreMap, store?: (s: Segmento[]) => void) {
  const [luoghi, segmenti] = await Promise.all([
    luoghiPubblici().catch(() => []),
    segmentiPercorsi().catch(() => []),
  ]);
  store?.(segmenti);

  // --- Percorsi: un livello per grado di certezza --------------------------
  for (const certezza of CERTEZZE) {
    const idSorgente = `percorsi-${certezza}`;
    const dati: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: segmenti
        .filter((s) => s.certainty === certezza)
        .map((s) => ({
          type: "Feature" as const,
          geometry: s.geojson as GeoJSON.LineString,
          properties: { route_id: s.route_id, certainty: s.certainty },
        })),
    };

    const esistente = mappa.getSource(idSorgente);
    if (esistente) {
      (esistente as GeoJSONSource).setData(dati);
      continue;
    }

    mappa.addSource(idSorgente, { type: "geojson", data: dati });
    const tratteggio = TRATTEGGIO_CERTEZZA[certezza];
    mappa.addLayer({
      id: idSorgente,
      type: "line",
      source: idSorgente,
      layout: { "line-cap": tratteggio ? "butt" : "round", "line-join": "round" },
      paint: {
        "line-color": COLORI_CERTEZZA[certezza],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 15, 4.5],
        ...(tratteggio ? { "line-dasharray": tratteggio } : {}),
      },
    });
  }

  // --- Ritrovamenti: pin con l'icona della categoria ------------------------
  const datiLuoghi: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: luoghi.map((l) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
      properties: {
        id: l.id,
        name: l.name,
        emoji: FINDING_EMOJI[l.finding_type as FindingType] ?? "📍",
      },
    })),
  };

  const sorgente = mappa.getSource("ritrovamenti");
  if (sorgente) {
    (sorgente as GeoJSONSource).setData(datiLuoghi);
  } else {
    // Clustering: da lontano i ritrovamenti vicini si raggruppano in un gruppo
    // con il numero, invece di accavallarsi. Ingrandendo si separano.
    mappa.addSource("ritrovamenti", {
      type: "geojson",
      data: datiLuoghi,
      cluster: true,
      clusterRadius: 44,
      clusterMaxZoom: 12,
    });

    // Gruppo (cluster): cerchio dimensionato sul numero di ritrovamenti.
    mappa.addLayer({
      id: "ritrovamenti-cluster",
      type: "circle",
      source: "ritrovamenti",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#7a2f22",
        "circle-opacity": 0.88,
        "circle-stroke-color": "#f0e5cc",
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 13, 5, 17, 20, 22],
      },
    });
    mappa.addLayer({
      id: "ritrovamenti-cluster-conteggio",
      type: "symbol",
      source: "ritrovamenti",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 13,
      },
      paint: { "text-color": "#f0e5cc" },
    });

    // Ritrovamenti singoli (fuori dai gruppi): l'icona della categoria.
    mappa.addLayer({
      id: "ritrovamenti",
      type: "symbol",
      source: "ritrovamenti",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["get", "emoji"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 16, 15, 26],
        "text-allow-overlap": true,
      },
    });
    mappa.addLayer({
      id: "ritrovamenti-etichette",
      type: "symbol",
      source: "ritrovamenti",
      filter: ["!", ["has", "point_count"]],
      minzoom: 8,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#2f2415",
        "text-halo-color": "#f0e5cc",
        "text-halo-width": 1.5,
      },
    });
  }

  // --- Icona "info" della campagna (inizio del tracciato) -------------------
  if (!mappa.getSource("campagna-info")) {
    mappa.addSource("campagna-info", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    mappa.addLayer({
      id: "campagna-info",
      type: "symbol",
      source: "campagna-info",
      layout: {
        "text-field": "ℹ️",
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 20, 12, 32],
        "text-allow-overlap": true,
      },
    });
  }
}
