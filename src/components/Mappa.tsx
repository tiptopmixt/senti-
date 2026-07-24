"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  COLORI_CERTEZZA,
  TRATTEGGIO_CERTEZZA,
  stileCartaAntica,
} from "@/lib/mappa/stile";
import {
  creaLuogo,
  luoghiDaRaccontare,
  luoghiPubblici,
  luoghiVicini,
  segmentiPercorsi,
  type LuogoVicino,
} from "@/lib/queries/mappa";
import { ensureSession } from "@/lib/supabase/auth";
import styles from "./Mappa.module.css";

// Bassano del Grappa: il centro del territorio pilota.
const CENTRO: [number, number] = [11.7342, 45.7666];
const ZOOM = 11;

interface PuntoNuovo {
  lon: number;
  lat: number;
  vicini: LuogoVicino[];
}

/**
 * La mappa: fondo carta antica, percorsi con la certezza visibile, e due
 * filtri sempre a portata di pollice.
 *
 * Il criterio che guida tutto: la cartografia è contesto, i percorsi e le
 * memorie sono il contenuto. Il fondo non deve mai gridare più forte.
 */
export function Mappa() {
  const t = useTranslations("mappa");
  const contenitoreRef = useRef<HTMLDivElement | null>(null);
  const mappaRef = useRef<MapLibreMap | null>(null);

  const [pronta, setPronta] = useState(false);
  const [mostraRaccontati, setMostraRaccontati] = useState(true);
  const [mostraDaRaccontare, setMostraDaRaccontare] = useState(true);
  const [puntoNuovo, setPuntoNuovo] = useState<PuntoNuovo | null>(null);
  const [nomeNuovo, setNomeNuovo] = useState("");
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  /** Apre il pannello "nuovo luogo", ma prima controlla se ne esiste già uno vicino. */
  const proponiLuogo = useCallback(async (lon: number, lat: number) => {
    setMessaggio(null);
    let vicini: LuogoVicino[] = [];
    try {
      vicini = await luoghiVicini(lon, lat, 100);
    } catch {
      // Senza rete si può comunque proporre il luogo: il doppione è un male minore.
    }
    setNomeNuovo("");
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
      // Import dinamico: MapLibre tocca `window`, quindi non deve girare nel
      // rendering server. In più resta fuori dal bundle iniziale — la mappa è
      // la parte più pesante dell'app e si carica solo a chi la apre.
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

      // In sviluppo la mappa è raggiungibile dalla console: diagnosticare uno
      // stile che non carica senza poterla ispezionare è una tortura.
      if (process.env.NODE_ENV === "development") {
        (window as unknown as { mappaSenti?: MapLibreMap }).mappaSenti = mappa;
      }

      mappa.on("error", (e) => {
        console.error("[mappa] errore:", e.error?.message ?? e);
      });

      mappa.on("load", () => {
        void caricaDati(mappa);
        setPronta(true);
      });

      // --- Tocco lungo: il modo naturale di dire "qui" su un telefono -------
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
      // Su desktop il tasto destro fa la stessa cosa.
      mappa.on("contextmenu", (e) => void proponiLuogo(e.lngLat.lng, e.lngLat.lat));
    })();

    return () => {
      annullato = true;
      annullaTimer();
      mappaRef.current?.remove();
      mappaRef.current = null;
    };
  }, [proponiLuogo]);

  // --- Filtri: nascondono/mostrano gli strati --------------------------------
  useEffect(() => {
    const mappa = mappaRef.current;
    if (!mappa || !pronta) return;
    for (const id of ["luoghi-raccontati", "luoghi-raccontati-etichette"]) {
      if (mappa.getLayer(id)) {
        mappa.setLayoutProperty(id, "visibility", mostraRaccontati ? "visible" : "none");
      }
    }
  }, [mostraRaccontati, pronta]);

  useEffect(() => {
    const mappa = mappaRef.current;
    if (!mappa || !pronta) return;
    for (const id of ["luoghi-da-raccontare", "luoghi-da-raccontare-etichette"]) {
      if (mappa.getLayer(id)) {
        mappa.setLayoutProperty(id, "visibility", mostraDaRaccontare ? "visible" : "none");
      }
    }
  }, [mostraDaRaccontare, pronta]);

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
        mappaRef.current?.flyTo({ center: [longitude, latitude], zoom: 16 });
        void proponiLuogo(longitude, latitude);
      },
      () => setMessaggio(t("errori.gpsNegato")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function salvaLuogo() {
    if (!puntoNuovo || nomeNuovo.trim() === "") return;
    setSalvataggio(true);
    try {
      await ensureSession();
      await creaLuogo(nomeNuovo, puntoNuovo.lon, puntoNuovo.lat);
      setPuntoNuovo(null);
      setMessaggio(t("luogoCreato"));
      const mappa = mappaRef.current;
      if (mappa) await caricaDati(mappa);
    } catch (e) {
      setMessaggio(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div className={styles.contenitore}>
      <div ref={contenitoreRef} className={styles.mappa} />

      {/* Filtri sempre in vista: sono il modo principale di leggere la mappa. */}
      <div className={styles.filtri}>
        <button
          className={mostraRaccontati ? styles.filtroAttivo : styles.filtro}
          onClick={() => setMostraRaccontati((v) => !v)}
          aria-pressed={mostraRaccontati}
        >
          <span className={styles.pallinoRaccontato} aria-hidden="true" />
          {t("filtri.raccontati")}
        </button>
        <button
          className={mostraDaRaccontare ? styles.filtroAttivo : styles.filtro}
          onClick={() => setMostraDaRaccontare((v) => !v)}
          aria-pressed={mostraDaRaccontare}
        >
          <span className={styles.pallinoDaRaccontare} aria-hidden="true" />
          {t("filtri.daRaccontare")}
        </button>
      </div>

      {/* Legenda della certezza: senza, le linee diverse non dicono nulla. */}
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

      {/* --- Pannello nuovo luogo --- */}
      {puntoNuovo && (
        <div className={styles.pannello} role="dialog" aria-modal="true">
          {puntoNuovo.vicini.length > 0 ? (
            <>
              <h2 className={styles.titoloPannello}>{t("vicini.titolo")}</h2>
              <p className={styles.testoPannello}>{t("vicini.spiegazione")}</p>
              <ul className={styles.listaVicini}>
                {puntoNuovo.vicini.map((v) => (
                  <li key={v.id}>
                    <strong>{v.name}</strong> · {Math.round(v.distanza_m)} m
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <h2 className={styles.titoloPannello}>{t("nuovoLuogo.titolo")}</h2>
          )}

          <label className={styles.campo}>
            <span>{t("nuovoLuogo.nome")}</span>
            <input
              type="text"
              value={nomeNuovo}
              onChange={(e) => setNomeNuovo(e.target.value)}
              placeholder={t("nuovoLuogo.esempio")}
              autoFocus
            />
          </label>

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setPuntoNuovo(null)}>
              {t("azioni.annulla")}
            </button>
            <button
              className={styles.primario}
              onClick={() => void salvaLuogo()}
              disabled={nomeNuovo.trim() === "" || salvataggio}
            >
              {salvataggio ? t("azioni.salvataggio") : t("azioni.creaLuogo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Carica luoghi e percorsi e li disegna. */
async function caricaDati(mappa: MapLibreMap) {
  const [luoghi, segmenti, daRaccontare] = await Promise.all([
    luoghiPubblici().catch(() => []),
    segmentiPercorsi().catch(() => []),
    luoghiDaRaccontare().catch(() => []),
  ]);

  // --- Percorsi: un livello per grado di certezza --------------------------
  // MapLibre non permette un tratteggio guidato dai dati, quindi la certezza
  // diventa tre strati distinti. È anche più chiaro da leggere nel codice.
  for (const certezza of ["attestato", "probabile", "ipotetico"] as const) {
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
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.8, 15, 4.5],
        ...(tratteggio ? { "line-dasharray": tratteggio } : {}),
      },
    });
  }

  // --- Luoghi raccontati ----------------------------------------------------
  const datiLuoghi: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: luoghi.map((l) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
      properties: { id: l.id, name: l.name, hazard: l.hazard_flag },
    })),
  };

  const sorgenteLuoghi = mappa.getSource("luoghi-raccontati");
  if (sorgenteLuoghi) {
    (sorgenteLuoghi as GeoJSONSource).setData(datiLuoghi);
  } else {
    mappa.addSource("luoghi-raccontati", { type: "geojson", data: datiLuoghi });
    mappa.addLayer({
      id: "luoghi-raccontati",
      type: "circle",
      source: "luoghi-raccontati",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 15, 10],
        "circle-color": "#7a2f22",
        "circle-stroke-color": "#f0e5cc",
        "circle-stroke-width": 2,
      },
    });
    mappa.addLayer({
      id: "luoghi-raccontati-etichette",
      type: "symbol",
      source: "luoghi-raccontati",
      minzoom: 12,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#2f2415",
        "text-halo-color": "#f0e5cc",
        "text-halo-width": 1.5,
      },
    });
  }

  // --- Luoghi da raccontare: i luoghi ancora muti ---------------------------
  const datiDaRaccontare: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: daRaccontare.map((l) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
      properties: { id: l.id, name: l.name },
    })),
  };

  const sorgenteDaRaccontare = mappa.getSource("luoghi-da-raccontare");
  if (sorgenteDaRaccontare) {
    (sorgenteDaRaccontare as GeoJSONSource).setData(datiDaRaccontare);
  } else {
    mappa.addSource("luoghi-da-raccontare", { type: "geojson", data: datiDaRaccontare });
    mappa.addLayer({
      id: "luoghi-da-raccontare",
      type: "circle",
      source: "luoghi-da-raccontare",
      paint: {
        // Cerchio vuoto: il posto c'è, la voce manca ancora.
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 15, 8],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#7a6440",
        "circle-stroke-width": 2,
      },
    });
    mappa.addLayer({
      id: "luoghi-da-raccontare-etichette",
      type: "symbol",
      source: "luoghi-da-raccontare",
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#7a6440",
        "text-halo-color": "#f0e5cc",
        "text-halo-width": 1.4,
      },
    });
  }
}
