"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FormaOnda } from "./FormaOnda";
import { formattaDurata, useRegistratore } from "@/lib/audio/useRegistratore";
import { salvaMemoria } from "@/lib/offline/db";
import { avviaCoda, elaboraCoda, type StatoCoda } from "@/lib/offline/queue";
import { ensureSession } from "@/lib/supabase/auth";
import styles from "./CatturaMemoria.module.css";

type Fase = "registra" | "riascolta" | "dati";

/**
 * Cattura di una memoria, prima di qualunque accesso.
 *
 * Ordine deliberato: si registra PRIMA, si compilano i dati DOPO. Chi raccoglie
 * una testimonianza non può fermare un anziano che ha iniziato a parlare per
 * riempire un modulo.
 *
 * La registrazione finisce su IndexedDB appena esiste; l'invio al server è un
 * problema separato, che la coda risolve quando c'è rete.
 */
export function CatturaMemoria() {
  const t = useTranslations("cattura");
  const {
    stato,
    durataMs,
    registrazione,
    errore,
    analyserRef,
    avvia,
    ferma,
    annulla,
  } = useRegistratore();

  const [fase, setFase] = useState<Fase>("registra");
  const [nomeNarratore, setNomeNarratore] = useState("");
  const [annoNascita, setAnnoNascita] = useState("");
  const [nota, setNota] = useState("");
  const [consenso, setConsenso] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvata, setSalvata] = useState(false);
  const [coda, setCoda] = useState<StatoCoda | null>(null);

  // La sessione anonima parte in sottofondo: nessuna schermata di accesso.
  useEffect(() => {
    void ensureSession().catch(() => {
      /* senza rete la sessione arriva dopo: la registrazione locale funziona comunque */
    });
    return avviaCoda(setCoda);
  }, []);

  useEffect(() => {
    if (registrazione) setFase("riascolta");
  }, [registrazione]);

  const urlRiascolto = useMemo(
    () => (registrazione ? URL.createObjectURL(registrazione.blob) : null),
    [registrazione],
  );
  useEffect(() => {
    return () => {
      if (urlRiascolto) URL.revokeObjectURL(urlRiascolto);
    };
  }, [urlRiascolto]);

  async function salva() {
    if (!registrazione || !consenso) return;
    setSalvataggio(true);
    try {
      const anno = annoNascita.trim() === "" ? null : Number(annoNascita);
      await salvaMemoria({
        id: crypto.randomUUID(),
        blob: registrazione.blob,
        mimeType: registrazione.mimeType,
        durataMs: registrazione.durataMs,
        creataIl: Date.now(),
        narratoreNome: nomeNarratore.trim() || null,
        narratoreAnnoNascita: Number.isFinite(anno) ? anno : null,
        consenso,
        nota: nota.trim() || null,
        poiId: null,
        stato: "in_attesa",
        tentativi: 0,
        ultimoErrore: null,
      });
      setSalvata(true);
      void elaboraCoda();
    } finally {
      setSalvataggio(false);
    }
  }

  function ricomincia() {
    annulla();
    setFase("registra");
    setNomeNarratore("");
    setAnnoNascita("");
    setNota("");
    setConsenso(false);
    setSalvata(false);
  }

  // --- Esito ----------------------------------------------------------------
  if (salvata) {
    return (
      <section className={styles.contenitore}>
        <p className={styles.esitoIcona} aria-hidden="true">✓</p>
        <h2 className={styles.titolo}>{t("salvata.titolo")}</h2>
        <p className={styles.testo}>
          {coda && !coda.online
            ? t("salvata.offline")
            : coda && coda.inAttesa > 0
              ? t("salvata.inCorso")
              : t("salvata.inviata")}
        </p>
        <button className={styles.primario} onClick={ricomincia}>
          {t("azioni.altraMemoria")}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.contenitore}>
      <h1 className={styles.titolo}>{t("titolo")}</h1>
      <p className={styles.testo}>{t("sottotitolo")}</p>

      {coda && coda.inAttesa > 0 && (
        <p className={coda.online ? styles.avviso : styles.avvisoOffline}>
          {coda.online
            ? t("coda.inInvio", { n: coda.inAttesa })
            : t("coda.attesaRete", { n: coda.inAttesa })}
        </p>
      )}

      {errore && <p className={styles.errore}>{errore}</p>}

      {/* --- Registrazione --- */}
      {fase === "registra" && (
        <div className={styles.blocco}>
          <div className={styles.onda}>
            <FormaOnda analyserRef={analyserRef} attiva={stato === "registrazione"} />
          </div>
          <p className={styles.timer} aria-live="polite">
            {formattaDurata(durataMs)}
          </p>
          {stato === "registrazione" ? (
            <button className={styles.registraAttivo} onClick={ferma}>
              {t("azioni.ferma")}
            </button>
          ) : (
            <button className={styles.registra} onClick={() => void avvia()}>
              {t("azioni.registra")}
            </button>
          )}
        </div>
      )}

      {/* --- Riascolto --- */}
      {fase === "riascolta" && registrazione && urlRiascolto && (
        <div className={styles.blocco}>
          <p className={styles.testo}>
            {t("riascolto.durata", { durata: formattaDurata(registrazione.durataMs) })}
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio className={styles.player} src={urlRiascolto} controls preload="metadata" />
          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={ricomincia}>
              {t("azioni.rifai")}
            </button>
            <button className={styles.primario} onClick={() => setFase("dati")}>
              {t("azioni.continua")}
            </button>
          </div>
        </div>
      )}

      {/* --- Dati del testimone e consenso --- */}
      {fase === "dati" && (
        <div className={styles.blocco}>
          <label className={styles.campo}>
            <span>{t("campi.nomeTestimone")}</span>
            <input
              type="text"
              value={nomeNarratore}
              onChange={(e) => setNomeNarratore(e.target.value)}
              autoComplete="off"
            />
          </label>

          <label className={styles.campo}>
            <span>{t("campi.annoNascita")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1850}
              max={new Date().getFullYear()}
              value={annoNascita}
              onChange={(e) => setAnnoNascita(e.target.value)}
            />
          </label>

          <label className={styles.campo}>
            <span>{t("campi.nota")}</span>
            <textarea
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={t("campi.notaEsempio")}
            />
            <small className={styles.aiuto}>{t("campi.notaAiuto")}</small>
          </label>

          <label className={styles.consenso}>
            <input
              type="checkbox"
              checked={consenso}
              onChange={(e) => setConsenso(e.target.checked)}
            />
            <span>{t("consenso.etichetta")}</span>
          </label>
          <p className={styles.aiuto}>{t("consenso.spiegazione")}</p>

          <p className={styles.registroPubblico}>{t("registro")}</p>

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setFase("riascolta")}>
              {t("azioni.indietro")}
            </button>
            <button
              className={styles.primario}
              onClick={() => void salva()}
              disabled={!consenso || salvataggio}
            >
              {salvataggio ? t("azioni.salvataggio") : t("azioni.salva")}
            </button>
          </div>
          {!consenso && <p className={styles.aiuto}>{t("consenso.obbligatorio")}</p>}
        </div>
      )}
    </section>
  );
}
