"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ensureSession } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { pulisciFoto } from "@/lib/foto/pulisci";
import { avviaCoda, salvaMemoria, type StatoCoda } from "@/lib/offline/coda";
import { RAGGI_ZONA, type FindingType } from "@/lib/validation";
import styles from "./CatturaMemoria.module.css";

type Fase = "zona" | "dettagli";

/**
 * Aggiungi una memoria. Semplice come mandare un messaggio.
 *
 * La posizione non è MAI precisa: dal punto indicato (GPS o tocco sulla mappa) si
 * ricava un centro scostato a caso e si salva solo una ZONA ampia (1/3/5 km). Il
 * punto esatto non viene mai inviato né memorizzato.
 */
export function CatturaRitrovamento() {
  const t = useTranslations("memoria");
  const tm = useTranslations("mappa");
  const router = useRouter();

  const [fase, setFase] = useState<Fase>("zona");
  // Punto preciso: serve SOLO a calcolare il centro, poi si scarta. Mai inviato.
  const [puntoPreciso, setPuntoPreciso] = useState<{ lon: number; lat: number } | null>(null);
  const [raggio, setRaggio] = useState<number>(1000);
  const [gpsErrore, setGpsErrore] = useState<string | null>(null);

  const [descrizione, setDescrizione] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [anonimo, setAnonimo] = useState(true);
  const [nome, setNome] = useState("");

  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<"inviata" | "in_coda" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [avvisoFoto, setAvvisoFoto] = useState<string | null>(null);
  const [coda, setCoda] = useState<StatoCoda | null>(null);
  const inCorsoRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
      } catch {
        /* offline / login anonimo assente: la coda riproverà */
      }
    })();
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      const lon = Number(q.get("lon"));
      const lat = Number(q.get("lat"));
      if (Number.isFinite(lon) && Number.isFinite(lat) && (lon !== 0 || lat !== 0)) {
        setPuntoPreciso({ lon, lat });
      }
    }
    return avviaCoda(setCoda);
  }, []);

  function sonoQui() {
    setGpsErrore(null);
    if (!navigator.geolocation) {
      setGpsErrore(tm("errori.gpsNonDisponibile"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPuntoPreciso({ lon: pos.coords.longitude, lat: pos.coords.latitude }),
      () => setGpsErrore(tm("errori.gpsNegato")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const descrizioneOk = descrizione.trim() !== "";

  async function pubblica() {
    if (!puntoPreciso || !descrizioneOk) return;
    if (inCorsoRef.current) return; // già in corso: niente doppio invio
    inCorsoRef.current = true;
    setSalvataggio(true);
    setErrore(null);
    try {
      const { lon, lat } = puntoPreciso;

      // Nome facoltativo: se scelto, aggiorna il nome pubblico del profilo.
      if (!anonimo && nome.trim() !== "") {
        try {
          const s = await ensureSession();
          await getSupabaseClient()
            .from("profiles")
            .update({ display_name: nome.trim().slice(0, 60) })
            .eq("id", s.user.id);
        } catch {
          /* non bloccare la pubblicazione per il nome */
        }
      }

      let fotoBlob: Blob | undefined;
      if (foto) {
        try {
          fotoBlob = await pulisciFoto(foto);
          setAvvisoFoto(null);
        } catch (fotoErr) {
          fotoBlob = undefined;
          setAvvisoFoto(fotoErr instanceof Error ? fotoErr.message : "Foto non elaborabile");
        }
      }

      const testo = descrizione.trim();
      const stato = await salvaMemoria(
        {
          findingType: "aneddoto" as FindingType,
          name: testo.slice(0, 60) || "Memoria",
          lon,
          lat,
          zoneRadiusM: raggio,
          kind: fotoBlob ? "foto" : "testo",
          body: testo,
          mediaPath: null,
          poiId: null,
          routeId: null,
          eventYear: null,
          hazardFlag: false,
          isAnonymous: anonimo,
          vocePropria: true,
          permessoTerzi: null,
          veridicita: true,
        },
        fotoBlob,
        fotoBlob ? "image/jpeg" : undefined,
      );

      setEsito(stato);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvataggio(false);
      inCorsoRef.current = false;
    }
  }

  function ricomincia() {
    setFase("zona");
    setPuntoPreciso(null);
    setRaggio(1000);
    setDescrizione("");
    setFoto(null);
    setAnonimo(true);
    setNome("");
    setEsito(null);
    setErrore(null);
  }

  // --- Esito: torna alla mappa con un messaggio breve ---------------------
  useEffect(() => {
    if (!esito) return;
    router.push("/mappa?ok=1");
  }, [esito, router]);

  if (esito) {
    return (
      <section className={styles.contenitore}>
        <p className={styles.esitoIcona} aria-hidden="true">✓</p>
      </section>
    );
  }

  return (
    <section className={styles.contenitore}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className={styles.titolo} style={{ margin: 0 }}>{t("titolo")}</h1>
        <button
          onClick={() => router.push("/mappa")}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.5rem",
            cursor: "pointer",
            padding: "0.3rem 0.6rem",
            color: "#2f2415",
            lineHeight: 1,
          }}
          aria-label={tm("info.chiudi")}
        >
          ✕
        </button>
      </div>

      {coda && coda.inAttesa > 0 && (
        <p className={coda.online ? styles.avviso : styles.avvisoOffline}>
          {t("coda.inAttesa", { n: coda.inAttesa })}
        </p>
      )}

      {errore && <p className={styles.errore}>{errore}</p>}

      {/* --- 1. Zona (mai il punto esatto) --- */}
      {fase === "zona" && (
        <div className={styles.blocco}>
          <p className={styles.aiutoZona}>{t("aiutoZona")}</p>

          {puntoPreciso ? (
            <p className={styles.testo}>✅ {t("posizionePresa")}</p>
          ) : (
            <button className={styles.secondario} onClick={sonoQui}>
              📍 {tm("sonoQui")}
            </button>
          )}
          {gpsErrore && <p className={styles.errore}>{gpsErrore}</p>}

          <p className={styles.domanda}>{t("ampiezzaZona")}</p>
          <div className={styles.scelteProvenienza}>
            {RAGGI_ZONA.map((r) => (
              <button
                key={r}
                className={raggio === r ? styles.sceltaAttiva : styles.scelta}
                onClick={() => setRaggio(r)}
              >
                {r / 1000} km
              </button>
            ))}
          </div>

          <div className={styles.azioni}>
            <button
              className={styles.primario}
              onClick={() => setFase("dettagli")}
              disabled={!puntoPreciso}
            >
              {t("azioni.continua")}
            </button>
          </div>
        </div>
      )}

      {/* --- 2. Dettagli (semplicissimo) --- */}
      {fase === "dettagli" && (
        <div className={styles.blocco}>
          <label className={styles.campo}>
            <span>{t("campi.descrizione")}</span>
            <textarea
              rows={4}
              value={descrizione}
              maxLength={2000}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder={t("campi.descrizioneEsempio")}
              autoFocus
            />
          </label>

          <label className={styles.campo}>
            <span>{t("campi.foto")}</span>
            <input
              type="file"
              accept="image/*,.heic,.heif"
              onChange={(e) => { setFoto(e.target.files?.[0] ?? null); setAvvisoFoto(null); }}
            />
            {foto && <small className={styles.testo}>📷 {foto.name}</small>}
            {avvisoFoto && <small className={styles.errore}>{avvisoFoto}</small>}
          </label>

          <label className={styles.consenso}>
            <input type="checkbox" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} />
            <span>{t("campi.anonimo")}</span>
          </label>
          {!anonimo && (
            <label className={styles.campo}>
              <span>{t("campi.nome")}</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={t("campi.nomeEsempio")}
              />
            </label>
          )}

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setFase("zona")}>
              {t("azioni.indietro")}
            </button>
            <button
              className={styles.primario}
              onClick={() => void pubblica()}
              disabled={!descrizioneOk || salvataggio}
            >
              {salvataggio ? t("azioni.salvataggio") : t("azioni.pubblica")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Compatibilità: la pagina importa ancora `CatturaMemoria`.
export const CatturaMemoria = CatturaRitrovamento;
