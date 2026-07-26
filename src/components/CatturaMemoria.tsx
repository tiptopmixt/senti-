"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ensureSession } from "@/lib/supabase/auth";
import { caricaFoto, pubblicaRitrovamento } from "@/lib/queries/contributions";
import { leggiLimiti, LIMITI_PREDEFINITI, type Limiti } from "@/lib/queries/settings";
import {
  FINDING_EMOJI,
  FINDING_TYPES,
  type FindingType,
} from "@/lib/validation";
import styles from "./CatturaMemoria.module.css";

type Fase = "categoria" | "dati" | "dichiarazione";

/**
 * Aggiungi un ritrovamento. Il gesto centrale è la scelta dell'ICONA: che tipo
 * di ritrovamento è. Poi si aggiungono foto e/o testo e la posizione. Infine la
 * dichiarazione di responsabilità (voce propria o permesso di terzi + veridicità).
 *
 * I ritrovamenti sono pubblici subito: la dichiarazione è la prova che chi
 * pubblica risponde di ciò che pubblica.
 */
export function CatturaRitrovamento() {
  const t = useTranslations("cattura");
  const tc = useTranslations("categorie");
  const tm = useTranslations("mappa");

  const [limiti, setLimiti] = useState<Limiti>(LIMITI_PREDEFINITI);
  const [fase, setFase] = useState<Fase>("categoria");
  const [categoria, setCategoria] = useState<FindingType | null>(null);
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [anno, setAnno] = useState("");
  const [nascondi, setNascondi] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [coord, setCoord] = useState<{ lon: number; lat: number } | null>(null);
  const [gpsErrore, setGpsErrore] = useState<string | null>(null);

  const [provenienza, setProvenienza] = useState<"mio" | "altro" | null>(null);
  const [confermaMia, setConfermaMia] = useState(false);
  const [permesso, setPermesso] = useState(false);
  const [veridicitaAltro, setVeridicitaAltro] = useState(false);

  const [salvataggio, setSalvataggio] = useState(false);
  const [salvata, setSalvata] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Sessione anonima in sottofondo + limiti + coordinate dalla mappa (query).
  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
        setLimiti(await leggiLimiti());
      } catch {
        /* offline: valgono i predefiniti */
      }
    })();
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      const lon = Number(q.get("lon"));
      const lat = Number(q.get("lat"));
      if (Number.isFinite(lon) && Number.isFinite(lat) && (lon !== 0 || lat !== 0)) {
        setCoord({ lon, lat });
      }
    }
  }, []);

  function sonoQui() {
    setGpsErrore(null);
    if (!navigator.geolocation) {
      setGpsErrore(tm("errori.gpsNonDisponibile"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoord({ lon: pos.coords.longitude, lat: pos.coords.latitude }),
      () => setGpsErrore(tm("errori.gpsNegato")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const dichiarazioneOk =
    provenienza === "mio"
      ? confermaMia
      : provenienza === "altro"
        ? permesso && veridicitaAltro
        : false;

  const datiOk = titolo.trim() !== "" && coord !== null && (foto !== null || descrizione.trim() !== "");

  async function pubblica() {
    if (!categoria || !coord || !dichiarazioneOk) return;
    setSalvataggio(true);
    setErrore(null);
    try {
      const mia = provenienza === "mio";
      let mediaPath: string | null = null;
      let kind: "foto" | "testo" = "testo";
      if (foto) {
        const id = crypto.randomUUID();
        mediaPath = await caricaFoto(id, foto, foto.type || "image/jpeg");
        kind = "foto";
      }
      const annoNum = anno.trim() === "" ? null : Number(anno);
      await pubblicaRitrovamento({
        findingType: categoria,
        name: titolo.trim(),
        lon: coord.lon,
        lat: coord.lat,
        kind,
        body: descrizione.trim() || null,
        mediaPath,
        poiId: null,
        routeId: null,
        eventYear: Number.isFinite(annoNum) ? annoNum : null,
        hazardFlag: nascondi,
        isAnonymous: true,
        vocePropria: mia,
        permessoTerzi: mia ? null : permesso,
        veridicita: mia ? true : veridicitaAltro,
      });
      setSalvata(true);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvataggio(false);
    }
  }

  function ricomincia() {
    setFase("categoria");
    setCategoria(null);
    setTitolo("");
    setDescrizione("");
    setAnno("");
    setNascondi(false);
    setFoto(null);
    setProvenienza(null);
    setConfermaMia(false);
    setPermesso(false);
    setVeridicitaAltro(false);
    setSalvata(false);
    setErrore(null);
  }

  // --- Esito ----------------------------------------------------------------
  if (salvata) {
    return (
      <section className={styles.contenitore}>
        <p className={styles.esitoIcona} aria-hidden="true">✓</p>
        <h2 className={styles.titolo}>{t("salvata.titolo")}</h2>
        <p className={styles.testo}>{t("salvata.inviata")}</p>
        <button className={styles.primario} onClick={ricomincia}>
          {t("azioni.altro")}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.contenitore}>
      <h1 className={styles.titolo}>{t("titolo")}</h1>
      <p className={styles.testo}>{t("sottotitolo")}</p>

      {errore && <p className={styles.errore}>{errore}</p>}

      {/* --- 1. Categoria/icona --- */}
      {fase === "categoria" && (
        <div className={styles.blocco}>
          <p className={styles.domanda}>{tc("titolo")}</p>
          <p className={styles.testo}>{tc("sottotitolo")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {FINDING_TYPES.map((ft) => (
              <button
                key={ft}
                onClick={() => {
                  setCategoria(ft);
                  setFase("dati");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 6px",
                  borderRadius: 12,
                  border: categoria === ft ? "2px solid #7a2f22" : "1px solid #cbb98f",
                  background: "#fbf5e6",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                <span style={{ fontSize: 28 }} aria-hidden="true">{FINDING_EMOJI[ft]}</span>
                <span>{tc(ft)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- 2. Dati (foto/testo + posizione) --- */}
      {fase === "dati" && categoria && (
        <div className={styles.blocco}>
          <p className={styles.domanda}>
            {FINDING_EMOJI[categoria]} {tc(categoria)}
          </p>

          <label className={styles.campo}>
            <span>{t("campi.titolo")}</span>
            <input
              type="text"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder={t("campi.titoloEsempio")}
              autoFocus
            />
          </label>

          <label className={styles.campo}>
            <span>{t("azioni.scattaFoto")}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            />
          </label>

          <label className={styles.campo}>
            <span>{t("campi.descrizione")}</span>
            <textarea
              rows={3}
              value={descrizione}
              maxLength={limiti.testoLunghezzaMassima}
              onChange={(e) => setDescrizione(e.target.value)}
            />
          </label>

          <label className={styles.campo}>
            <span>{t("campi.annoEvento")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={anno}
              onChange={(e) => setAnno(e.target.value)}
            />
          </label>

          <label className={styles.consenso}>
            <input type="checkbox" checked={nascondi} onChange={(e) => setNascondi(e.target.checked)} />
            <span>{t("campi.nascondiPosizione")}</span>
          </label>

          {/* Posizione */}
          {coord ? (
            <p className={styles.testo}>
              📍 {coord.lat.toFixed(5)}, {coord.lon.toFixed(5)}
            </p>
          ) : (
            <button className={styles.secondario} onClick={sonoQui}>
              📍 {tm("sonoQui")}
            </button>
          )}
          {gpsErrore && <p className={styles.errore}>{gpsErrore}</p>}

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setFase("categoria")}>
              {t("azioni.indietro")}
            </button>
            <button
              className={styles.primario}
              onClick={() => setFase("dichiarazione")}
              disabled={!datiOk}
            >
              {t("azioni.pubblica")}
            </button>
          </div>
        </div>
      )}

      {/* --- 3. Dichiarazione di responsabilità --- */}
      {fase === "dichiarazione" && (
        <div className={styles.blocco}>
          <p className={styles.domanda}>{t("dichiarazione.domanda")}</p>
          <div className={styles.scelteProvenienza}>
            <button
              className={provenienza === "mio" ? styles.sceltaAttiva : styles.scelta}
              onClick={() => setProvenienza("mio")}
            >
              {t("dichiarazione.eMio")}
            </button>
            <button
              className={provenienza === "altro" ? styles.sceltaAttiva : styles.scelta}
              onClick={() => setProvenienza("altro")}
            >
              {t("dichiarazione.eAltro")}
            </button>
          </div>

          {provenienza === "mio" && (
            <label className={styles.consenso}>
              <input type="checkbox" checked={confermaMia} onChange={(e) => setConfermaMia(e.target.checked)} />
              <span>{t("dichiarazione.confermaMia")}</span>
            </label>
          )}

          {provenienza === "altro" && (
            <>
              <p className={styles.avvisoPesante}>{t("dichiarazione.avvisoTerzi")}</p>
              <label className={styles.consenso}>
                <input type="checkbox" checked={permesso} onChange={(e) => setPermesso(e.target.checked)} />
                <span>{t("dichiarazione.hoPermesso")}</span>
              </label>
              <label className={styles.consenso}>
                <input type="checkbox" checked={veridicitaAltro} onChange={(e) => setVeridicitaAltro(e.target.checked)} />
                <span>{t("dichiarazione.veridicita")}</span>
              </label>
            </>
          )}

          {provenienza && <p className={styles.registroPubblico}>{t("registro")}</p>}

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setFase("dati")}>
              {t("azioni.indietro")}
            </button>
            <button
              className={styles.primario}
              onClick={() => void pubblica()}
              disabled={!dichiarazioneOk || salvataggio}
            >
              {salvataggio ? t("azioni.salvataggio") : t("azioni.salva")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Compatibilità: la pagina importa ancora `CatturaMemoria`.
export const CatturaMemoria = CatturaRitrovamento;
