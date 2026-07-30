"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  TRATTEGGIO_CERTEZZA,
  stileCartaAntica,
} from "@/lib/mappa/stile";
import {
  battaglie,
  condottieri,
  eventiVicini,
  fotoPubbliche,
  imperi,
  luoghiPubblici,
  luoghiVicini,
  percorsi,
  segmentiPercorsi,
  urlFotoPubblica,
  type Battaglia,
  type EventoVicino,
  type Condottiero,
  type Impero,
  type LuogoVicino,
  type Percorso,
  type Segmento,
} from "@/lib/queries/mappa";
import { FINDING_EMOJI, type FindingType } from "@/lib/validation";
import { cerchioGeoJSON } from "@/lib/geo/zona";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { SelettoreLingua } from "./SelettoreLingua";
import { ColonnaTempo } from "./ColonnaTempo";
import { BarraPulsanti } from "./BarraPulsanti";
import styles from "./Mappa.module.css";

// Vista mondiale: le campagne sono sparse in tutto il mondo.
const CENTRO: [number, number] = [12, 35];
const ZOOM = 1.6;

const CERTEZZE = ["attestato", "probabile", "ipotetico"] as const;

// Un colore per ogni impero/fazione: le frecce di ogni campagna prendono il
// colore del suo impero, così si distingue a colpo d'occhio chi è chi.
const COLORE_IMPERO: Record<string, string> = {
  egitto: "#b8860b",
  persia: "#6b3fa0",
  grecia: "#1f6f8b",
  cartagine: "#b5651d",
  roma: "#a01818",
  arabi: "#2e7d32",
  franchi: "#3949ab",
  crociati: "#8d6e63",
  mongoli: "#d84315",
  ottomani: "#00838f",
  spagna: "#c2185b",
  francia: "#283593",
  russia: "#5d4037",
  italia: "#558b2f",
  mondiali: "#37474f",
};
const COLORE_DEFAULT = "#5c3a1e";

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
  // Battaglie per id, lette dal gestore di click sulle icone ⚔️.
  const battaglieMapRef = useRef<Map<string, Battaglia>>(new Map());

  const [pronta, setPronta] = useState(false);
  const [listaCondottieri, setListaCondottieri] = useState<Condottiero[]>([]);
  const [listaImperi, setListaImperi] = useState<Impero[]>([]);
  const [listaPercorsi, setListaPercorsi] = useState<Percorso[]>([]);
  // Imperi/campagne spuntati (un impero = tutti i suoi condottieri). Più i
  // singoli condottieri (re) spuntati a parte. Vuoto = nessuna campagna.
  const [imperiVisibili, setImperiVisibili] = useState<Set<string>>(new Set());
  const [condottieriVisibili, setCondottieriVisibili] = useState<Set<string>>(new Set());
  const [imperiEspansi, setImperiEspansi] = useState<Set<string>>(new Set());
  const [pannelloCampagne, setPannelloCampagne] = useState(false);
  const [puntoNuovo, setPuntoNuovo] = useState<PuntoNuovo | null>(null);
  const [puntoTempo, setPuntoTempo] = useState<{ lon: number; lat: number; nome?: string; poiId?: string } | null>(null);
  const [infoCampagna, setInfoCampagna] = useState<Condottiero | null>(null);
  const [infoImpero, setInfoImpero] = useState<Impero | null>(null);
  const [infoBattaglia, setInfoBattaglia] = useState<Battaglia | null>(null);
  const [pannelloEventi, setPannelloEventi] = useState(false);
  const [eventi, setEventi] = useState<EventoVicino[] | null>(null);
  const [eventiInCorso, setEventiInCorso] = useState(false);
  const [pannelloImpostazioni, setPannelloImpostazioni] = useState(false);
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
      const { Map: MapCtor, NavigationControl } = await import("maplibre-gl");
      if (annullato || !contenitoreRef.current) return;

      const mappa = new MapCtor({
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
        void caricaDati(mappa, (segs, batts) => {
          segmentiRef.current = segs;
          battaglieMapRef.current = new Map(batts.map((b) => [b.id, b]));
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
        // Tocco su un'icona ⚔️: apre la scheda della battaglia.
        const batt = mappa.queryRenderedFeatures(e.point, { layers: ["battaglie"] });
        if (batt.length > 0) {
          const bid = batt[0].properties?.id as string | undefined;
          const b = bid ? battaglieMapRef.current.get(bid) : null;
          if (b) setInfoBattaglia(b);
          return;
        }
        // Tocco su un gruppo di foto: zooma per aprirlo.
        const gruppiFoto = mappa.queryRenderedFeatures(e.point, { layers: ["foto-cluster"] });
        if (gruppiFoto.length > 0 && gruppiFoto[0].geometry.type === "Point") {
          const cid = gruppiFoto[0].properties?.cluster_id as number;
          const src = mappa.getSource("foto") as GeoJSONSource;
          const c = gruppiFoto[0].geometry.coordinates as [number, number];
          void src.getClusterExpansionZoom(cid).then((zm) =>
            mappa.easeTo({ center: c, zoom: zm, duration: 600 }),
          );
          return;
        }
        // Tocco su una miniatura: apre i dettagli (foto grande) sul centro zona.
        const thumb = mappa.queryRenderedFeatures(e.point, { layers: ["foto-thumb"] });
        if (thumb.length > 0) {
          setPuntoTempo({
            lon: thumb[0].properties?.lon as number,
            lat: thumb[0].properties?.lat as number,
            nome: thumb[0].properties?.name as string | undefined,
            poiId: thumb[0].properties?.id as string | undefined,
          });
          return;
        }
        // Tocco su una zona (memoria): apre "Cosa è successo qui" sul suo centro.
        const zone = mappa.queryRenderedFeatures(e.point, { layers: ["zone-fill"] });
        const z = zone[0];
        if (z) {
          setPuntoTempo({
            lon: z.properties?.lon as number,
            lat: z.properties?.lat as number,
            nome: z.properties?.name as string | undefined,
            poiId: z.properties?.id as string | undefined,
          });
        }
      });
      for (const layer of ["zone-fill", "foto-thumb", "foto-cluster", "campagna-info", "battaglie"]) {
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

  // Condottieri raggruppati per impero (per la lista espandibile).
  const condottieriPerImpero = useMemo(() => {
    const m = new Map<string, Condottiero[]>();
    for (const c of listaCondottieri) {
      const k = c.empire_id ?? "_";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return m;
  }, [listaCondottieri]);

  // I commander_id visibili = condottieri degli imperi spuntati + singoli
  // condottieri (re) spuntati a parte.
  const commanderIdsVisibili = useMemo(() => {
    const ids = new Set<string>(condottieriVisibili);
    for (const c of listaCondottieri) {
      if (c.empire_id && imperiVisibili.has(c.empire_id)) ids.add(c.id);
    }
    return Array.from(ids);
  }, [imperiVisibili, condottieriVisibili, listaCondottieri]);

  // I route_id visibili = percorsi dei condottieri degli imperi spuntati.
  const routeIdsVisibili = useMemo(() => {
    const cmd = new Set(commanderIdsVisibili);
    return listaPercorsi.filter((p) => p.commander_id && cmd.has(p.commander_id)).map((p) => p.id);
  }, [commanderIdsVisibili, listaPercorsi]);

  // --- Filtro condottiero: mostra solo i percorsi del condottiero scelto e
  //     centra la mappa sulla campagna (Europa → Asia, il mondo si sposta). ---
  useEffect(() => {
    const mappa = mappaRef.current;
    if (!mappa || !pronta) return;

    // Mostra SOLO i percorsi (e le frecce) degli imperi spuntati. Nessuno spuntato
    // = array vuoto = nessun percorso disegnato.
    for (const c of CERTEZZE) {
      for (const id of [`percorsi-${c}`, `percorsi-${c}-frecce`]) {
        if (!mappa.getLayer(id)) continue;
        mappa.setFilter(id, ["in", ["get", "route_id"], ["literal", routeIdsVisibili]]);
      }
    }

    // Battaglie ⚔️: solo dei condottieri degli imperi spuntati.
    if (mappa.getLayer("battaglie")) {
      mappa.setFilter("battaglie", ["in", ["get", "commander_id"], ["literal", commanderIdsVisibili]]);
    }

    const infoSrc = mappa.getSource("campagna-info") as GeoJSONSource | undefined;

    // Nessuna campagna spuntata: vista mondiale e nessuna icona info.
    if (routeIdsVisibili.length === 0) {
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
  }, [routeIdsVisibili, commanderIdsVisibili, pronta, listaPercorsi]);

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

  // --- Eventi storici vicini: usa il GPS o, se spento, il centro della mappa ---
  function apriEventi() {
    setPannelloEventi(true);
    setEventi(null);
    setEventiInCorso(true);
    const carica = (lon: number, lat: number) => {
      void eventiVicini(lon, lat)
        .then(setEventi)
        .catch(() => setEventi([]))
        .finally(() => setEventiInCorso(false));
    };
    const centroMappa = () => {
      const c = mappaRef.current?.getCenter();
      carica(c?.lng ?? CENTRO[0], c?.lat ?? CENTRO[1]);
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => carica(pos.coords.longitude, pos.coords.latitude),
        centroMappa, // GPS negato/assente: uso il centro della mappa
        { enableHighAccuracy: true, timeout: 8000 },
      );
    } else {
      centroMappa();
    }
  }

  /** Vai a un evento: centra la mappa e aprine la scheda. */
  function vaiAEvento(ev: EventoVicino) {
    setPannelloEventi(false);
    mappaRef.current?.flyTo({ center: [ev.lon, ev.lat], zoom: 8, duration: 1200 });
    if (ev.tipo === "battaglia") {
      const b = battaglieMapRef.current.get(ev.id);
      if (b) setInfoBattaglia(b);
    } else if (ev.commander_id) {
      const c = condottieriMapRef.current.get(ev.commander_id);
      if (c) setInfoCampagna(c);
    }
  }

  /** Distanza leggibile: "a 4 km" oppure "a 300 m". */
  function distanzaLeggibile(m: number): string {
    return m >= 1000 ? `a ${Math.round(m / 1000)} km` : `a ${Math.round(m)} m`;
  }

  /** Va al form "aggiungi ritrovamento" con le coordinate scelte. */
  function aggiungiQui() {
    if (!puntoNuovo) return;
    router.push(`/racconta?lon=${puntoNuovo.lon}&lat=${puntoNuovo.lat}`);
  }

  return (
    <div className={styles.contenitore}>
      <div ref={contenitoreRef} className={styles.mappa} />

      {/* Barra pulsanti unificata: spostabili su 4 bordi.
         Nascosta quando un pannello è aperto per non coprire i comandi. */}
      <BarraPulsanti
        onAggiungi={() => router.push("/racconta")}
        onSonoQui={sonoQui}
        onCampagne={() => setPannelloCampagne((v) => !v)}
        onEventi={apriEventi}
        onImpostazioni={() => setPannelloImpostazioni((v) => !v)}
        campagneAttive={imperiVisibili.size + condottieriVisibili.size}
        visibile={!pannelloEventi && !infoCampagna && !infoImpero && !infoBattaglia && !pannelloCampagne && !pannelloImpostazioni && !puntoNuovo && !puntoTempo}
      />

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

      {/* --- Eventi storici vicini --- */}
      {pannelloEventi && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>📜 {t("eventi.titolo")}</h2>
            <button className={styles.chiudiPannello} onClick={() => setPannelloEventi(false)} aria-label={t("info.chiudi")}>✕</button>
          </div>
          {eventiInCorso && <p className={styles.testoPannello}>{t("eventi.caricamento")}</p>}

          {!eventiInCorso && eventi && eventi.length === 0 && (
            <>
              <p className={styles.testoPannello}>{t("eventi.vuoto")}</p>
              <div className={styles.azioni}>
                <button className={styles.secondario} onClick={() => setPannelloEventi(false)}>
                  {t("eventi.esplora")}
                </button>
                <button className={styles.primario} onClick={() => router.push("/racconta")}>
                  {t("aggiungi")}
                </button>
              </div>
            </>
          )}

          {!eventiInCorso && eventi && eventi.length > 0 && (
            <>
              <ul className={styles.listaVicini}>
                {eventi.map((ev) => (
                  <li
                    key={ev.tipo + ev.id}
                    style={{ cursor: "pointer", padding: "0.5rem 0.2rem", borderBottom: "1px solid rgba(0,0,0,0.08)" }}
                    onClick={() => vaiAEvento(ev)}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {ev.tipo === "battaglia" ? "⚔️ " : "📍 "}
                      {ev.titolo}
                    </div>
                    <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
                      {[
                        ev.schieramento,
                        ev.anno != null ? (ev.anno < 0 ? `${-ev.anno} a.C.` : `${ev.anno}`) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#7a2f22", fontWeight: 600 }}>
                      {distanzaLeggibile(ev.distanza_m)}
                    </div>
                  </li>
                ))}
              </ul>
              <div className={styles.azioni}>
                <button className={styles.primario} onClick={() => setPannelloEventi(false)}>
                  {t("info.chiudi")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* --- Scheda "info" della campagna --- */}
      {infoCampagna && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>ℹ️ {infoCampagna.name}</h2>
            <button className={styles.chiudiPannello} onClick={() => setInfoCampagna(null)} aria-label={t("info.chiudi")}>✕</button>
          </div>
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
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>🏛️ {infoImpero.name}</h2>
            <button className={styles.chiudiPannello} onClick={() => setInfoImpero(null)} aria-label={t("info.chiudi")}>✕</button>
          </div>
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

      {/* --- Scheda della battaglia (chi contro chi) --- */}
      {infoBattaglia && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>⚔️ {infoBattaglia.name}</h2>
            <button className={styles.chiudiPannello} onClick={() => setInfoBattaglia(null)} aria-label={t("info.chiudi")}>✕</button>
          </div>
          {infoBattaglia.year != null && (
            <p className={styles.testoPannello}>
              {infoBattaglia.year < 0
                ? `${-infoBattaglia.year} a.C.`
                : `${infoBattaglia.year} d.C.`}
            </p>
          )}
          {(infoBattaglia.side_a || infoBattaglia.side_b) && (
            <p className={styles.testoPannello} style={{ fontWeight: 600 }}>
              {infoBattaglia.side_a} ⚔️ {infoBattaglia.side_b}
            </p>
          )}
          {infoBattaglia.outcome && (
            <p className={styles.testoPannello}>
              <strong>{t("info.esito")}:</strong> {infoBattaglia.outcome}
            </p>
          )}
          {infoBattaglia.source_name && (
            <p className={styles.testoPannello}>
              {t("info.fonte")}: {infoBattaglia.source_name}
            </p>
          )}
          <p className={styles.testoPannello} style={{ opacity: 0.7 }}>{t("info.nota")}</p>
          <div className={styles.azioni}>
            <button className={styles.primario} onClick={() => setInfoBattaglia(null)}>
              {t("info.chiudi")}
            </button>
          </div>
        </div>
      )}

      {/* --- Pannello campagne (filtro a due livelli: impero → condottieri) --- */}
      {pannelloCampagne && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>🗺️ {t("filtri.campagne")}</h2>
            <button className={styles.chiudiPannello} onClick={() => setPannelloCampagne(false)} aria-label={t("info.chiudi")}>✕</button>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
            <button
              className={styles.secondario}
              style={{ flex: "none", minHeight: "2.5rem", fontSize: "0.9rem" }}
              onClick={() => {
                setImperiVisibili(new Set(listaImperi.map((i) => i.id)));
                setCondottieriVisibili(new Set());
              }}
            >
              {t("filtri.tutte")}
            </button>
            <button
              className={styles.secondario}
              style={{ flex: "none", minHeight: "2.5rem", fontSize: "0.9rem" }}
              onClick={() => {
                setImperiVisibili(new Set());
                setCondottieriVisibili(new Set());
              }}
            >
              {t("filtri.nessuna")}
            </button>
          </div>
          {listaImperi.map((imp) => {
            const espanso = imperiEspansi.has(imp.id);
            const imperoAttivo = imperiVisibili.has(imp.id);
            return (
              <div key={imp.id} style={{ padding: "0.15rem 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <button
                    className={styles.secondario}
                    style={{ flex: "none", minHeight: "auto", padding: "0.1rem 0.5rem", fontSize: "0.85rem" }}
                    onClick={() =>
                      setImperiEspansi((prev) => {
                        const n = new Set(prev);
                        if (n.has(imp.id)) n.delete(imp.id);
                        else n.add(imp.id);
                        return n;
                      })
                    }
                    aria-label="espandi"
                  >
                    {espanso ? "▾" : "▸"}
                  </button>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={imperoAttivo}
                      onChange={() =>
                        setImperiVisibili((prev) => {
                          const n = new Set(prev);
                          if (n.has(imp.id)) n.delete(imp.id);
                          else n.add(imp.id);
                          return n;
                        })
                      }
                    />
                    <span>{imp.name}</span>
                  </label>
                  <button
                    className={styles.secondario}
                    style={{ flex: "none", minHeight: "auto", padding: "0.15rem 0.5rem", fontSize: "0.85rem" }}
                    onClick={() => setInfoImpero(imp)}
                    aria-label={t("filtri.schedaImpero")}
                  >
                    ℹ️
                  </button>
                </div>
                {espanso && (
                  <div style={{ paddingLeft: "1.7rem" }}>
                    {(condottieriPerImpero.get(imp.id) ?? []).map((c) => (
                      <label
                        key={c.id}
                        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.15rem 0", cursor: "pointer", fontSize: "0.9rem" }}
                      >
                        <input
                          type="checkbox"
                          checked={imperoAttivo || condottieriVisibili.has(c.id)}
                          disabled={imperoAttivo}
                          onChange={() =>
                            setCondottieriVisibili((prev) => {
                              const n = new Set(prev);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          }
                        />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className={styles.azioni}>
            <button className={styles.primario} onClick={() => setPannelloCampagne(false)}>
              {t("info.chiudi")}
            </button>
          </div>
        </div>
      )}

      {/* --- Pannello Impostazioni: legale + lingua + legenda --- */}
      {pannelloImpostazioni && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>⚙️ {t("pannelloImpostazioni.titolo")}</h2>
            <button className={styles.chiudiPannello} onClick={() => setPannelloImpostazioni(false)} aria-label={t("info.chiudi")}>✕</button>
          </div>

          <p className={styles.testoPannello} style={{ fontWeight: 600 }}>
            {t("pannelloImpostazioni.linkUtili")}
          </p>
          <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/privacy" className={styles.linkImpostazioni} onClick={() => setPannelloImpostazioni(false)}>
              {t("pannelloImpostazioni.privacy")}
            </Link>
            <Link href="/termini" className={styles.linkImpostazioni} onClick={() => setPannelloImpostazioni(false)}>
              {t("pannelloImpostazioni.termini")}
            </Link>
            <Link href="/cookie" className={styles.linkImpostazioni} onClick={() => setPannelloImpostazioni(false)}>
              {t("pannelloImpostazioni.cookie")}
            </Link>
          </nav>

          <p className={styles.testoPannello} style={{ fontWeight: 600, marginTop: "0.5rem" }}>
            {t("pannelloImpostazioni.lingua")}
          </p>
          <SelettoreLingua />

          <p className={styles.testoPannello} style={{ fontWeight: 600, marginTop: "0.5rem" }}>
            {t("pannelloImpostazioni.legenda")}
          </p>
          <div className={styles.legendaImpostazioni}>
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

          <div className={styles.azioni}>
            <button className={styles.primario} onClick={() => setPannelloImpostazioni(false)}>
              {t("info.chiudi")}
            </button>
          </div>
        </div>
      )}

      {/* --- Pannello nuovo ritrovamento --- */}
      {puntoNuovo && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          <div className={styles.testaPannello}>
            <h2 className={styles.titoloPannello}>
              {puntoNuovo.vicini.length > 0 ? t("vicini.titolo") : t("nuovoLuogo.titolo")}
            </h2>
            <button className={styles.chiudiPannello} onClick={() => setPuntoNuovo(null)} aria-label={t("info.chiudi")}>✕</button>
          </div>
          {puntoNuovo.vicini.length > 0 ? (
            <>
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
          ) : null}

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

/** Scarica una foto e la ritaglia in una miniatura quadrata (per la mappa). */
async function caricaMiniatura(url: string, lato = 96): Promise<ImageData> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = lato;
    canvas.height = lato;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    const scala = Math.max(lato / bmp.width, lato / bmp.height);
    const w = bmp.width * scala;
    const h = bmp.height * scala;
    ctx.drawImage(bmp, (lato - w) / 2, (lato - h) / 2, w, h);
    return ctx.getImageData(0, 0, lato, lato);
  } finally {
    bmp.close?.();
  }
}

/** Carica ritrovamenti e percorsi e li disegna. `store` riceve i segmenti
 *  caricati, così il componente può calcolare i limiti per il centraggio. */
async function caricaDati(
  mappa: MapLibreMap,
  store?: (s: Segmento[], b: Battaglia[]) => void,
) {
  const [luoghiRaw, segmenti, cmds, routes, imps, batts, foto] = await Promise.all([
    luoghiPubblici().catch(() => []),
    segmentiPercorsi().catch(() => []),
    condottieri().catch(() => []),
    percorsi().catch(() => []),
    imperi().catch(() => []),
    battaglie().catch(() => []),
    fotoPubbliche().catch(() => []),
  ]);
  store?.(segmenti, batts);

  // Deduplica difensiva: un record si disegna UNA sola volta (mai doppioni).
  const luoghi = Array.from(new Map(luoghiRaw.map((l) => [l.id, l])).values());
  // poi_id → percorso della prima foto (per le miniature).
  const fotoDiPoi = new Map<string, string>();
  for (const f of foto) if (!fotoDiPoi.has(f.poi_id)) fotoDiPoi.set(f.poi_id, f.media_path);

  // route_id → colore dell'impero (per colorare linee e frecce per fazione).
  const empColor = new Map(imps.map((e) => [e.id, COLORE_IMPERO[e.slug] ?? COLORE_DEFAULT]));
  const cmdEmp = new Map(cmds.map((c) => [c.id, c.empire_id]));
  const routeColor = new Map<string, string>();
  for (const r of routes) {
    const eid = r.commander_id ? cmdEmp.get(r.commander_id) : null;
    routeColor.set(r.id, (eid && empColor.get(eid)) || COLORE_DEFAULT);
  }
  const coloreDi = (routeId: string) => routeColor.get(routeId) ?? COLORE_DEFAULT;

  // --- Percorsi: linee colorate per impero + frecce direzionali ------------
  // La certezza resta lo STILE della linea (continua/tratteggiata/punteggiata);
  // il COLORE indica l'impero/fazione. Le frecce mostrano la direzione (e la
  // lunghezza) della campagna.
  for (const certezza of CERTEZZE) {
    const idSorgente = `percorsi-${certezza}`;
    const dati: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: segmenti
        .filter((s) => s.certainty === certezza)
        .map((s) => ({
          type: "Feature" as const,
          geometry: s.geojson as GeoJSON.LineString,
          properties: { route_id: s.route_id, certainty: s.certainty, color: coloreDi(s.route_id) },
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
      filter: ["in", ["get", "route_id"], ["literal", []]] as never,
      layout: { "line-cap": tratteggio ? "butt" : "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 15, 4.5],
        ...(tratteggio ? { "line-dasharray": tratteggio } : {}),
      },
    });
    mappa.addLayer({
      id: `${idSorgente}-frecce`,
      type: "symbol",
      source: idSorgente,
      filter: ["in", ["get", "route_id"], ["literal", []]] as never,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 90,
        "text-field": "▸",
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 14, 10, 24],
        "text-rotation-alignment": "map",
        "text-keep-upright": false,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#f0e5cc",
        "text-halo-width": 1.2,
      },
    });
  }

  // --- Memorie utente: SEMPRE una ZONA/cerchio ampio, mai un pin sul luogo ---
  // La posizione precisa non esiste nel dato: si disegna un cerchio del raggio
  // della zona (default 1 km) centrato sul centro già scostato.
  const datiZone: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: luoghi.map((l) => ({
      type: "Feature" as const,
      geometry: cerchioGeoJSON(l.lon, l.lat, l.zone_radius_m ?? 1000),
      properties: {
        id: l.id,
        name: l.name,
        lon: l.lon,
        lat: l.lat,
        emoji: FINDING_EMOJI[l.finding_type as FindingType] ?? "📝",
      },
    })),
  };

  const sorgZone = mappa.getSource("zone");
  if (sorgZone) {
    (sorgZone as GeoJSONSource).setData(datiZone);
  } else {
    mappa.addSource("zone", { type: "geojson", data: datiZone });
    mappa.addLayer({
      id: "zone-fill",
      type: "fill",
      source: "zone",
      paint: { "fill-color": "#7a2f22", "fill-opacity": 0.12 },
    });
    mappa.addLayer({
      id: "zone-bordo",
      type: "line",
      source: "zone",
      paint: { "line-color": "#7a2f22", "line-opacity": 0.55, "line-width": 1.5 },
    });
    mappa.addLayer({
      id: "zone-icona",
      type: "symbol",
      source: "zone",
      minzoom: 8,
      layout: {
        "text-field": ["get", "emoji"],
        "text-size": 20,
        "text-allow-overlap": true,
      },
    });
  }

  // --- Miniature foto: sul CENTRO della zona (offuscato), mai sul punto esatto.
  //     Foto vicine si raggruppano in un unico segnaposto col numero.
  const luoghiConFoto = luoghi.filter((l) => fotoDiPoi.has(l.id));
  const datiFoto: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: luoghiConFoto.map((l) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
      properties: { id: l.id, name: l.name, lon: l.lon, lat: l.lat, icon: `foto-${l.id}` },
    })),
  };

  // Carica ogni miniatura come immagine della mappa (una per poi con foto).
  await Promise.all(
    luoghiConFoto.map(async (l) => {
      const nome = `foto-${l.id}`;
      if (mappa.hasImage(nome)) return;
      try {
        const img = await caricaMiniatura(urlFotoPubblica(fotoDiPoi.get(l.id)!), 96);
        if (!mappa.hasImage(nome)) mappa.addImage(nome, img, { pixelRatio: 2 });
      } catch {
        /* foto non caricabile: resta comunque la zona */
      }
    }),
  );

  const sorgFoto = mappa.getSource("foto");
  if (sorgFoto) {
    (sorgFoto as GeoJSONSource).setData(datiFoto);
  } else {
    mappa.addSource("foto", {
      type: "geojson",
      data: datiFoto,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    });
    // Gruppo di foto vicine: un cerchio col numero.
    mappa.addLayer({
      id: "foto-cluster",
      type: "circle",
      source: "foto",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#2f2415",
        "circle-opacity": 0.9,
        "circle-stroke-color": "#f0e5cc",
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 20, 26],
      },
    });
    mappa.addLayer({
      id: "foto-cluster-conteggio",
      type: "symbol",
      source: "foto",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 14,
      },
      paint: { "text-color": "#f0e5cc" },
    });
    // Miniatura singola.
    mappa.addLayer({
      id: "foto-thumb",
      type: "symbol",
      source: "foto",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.45, 14, 0.95],
        "icon-allow-overlap": true,
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

  // --- Battaglie: punti di scontro ⚔️ (chi contro chi) ---------------------
  const datiBattaglie: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: batts.map((b) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [b.lon, b.lat] },
      properties: { id: b.id, commander_id: b.commander_id ?? "" },
    })),
  };
  const sorgBatt = mappa.getSource("battaglie");
  if (sorgBatt) {
    (sorgBatt as GeoJSONSource).setData(datiBattaglie);
  } else {
    mappa.addSource("battaglie", { type: "geojson", data: datiBattaglie });
    mappa.addLayer({
      id: "battaglie",
      type: "symbol",
      source: "battaglie",
      filter: ["in", ["get", "commander_id"], ["literal", []]] as never,
      layout: {
        "text-field": "⚔️",
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 15, 12, 26],
        "text-allow-overlap": true,
      },
    });
  }
}
