"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FormaOnda } from "./FormaOnda";
import { formattaDurata, useRegistratore } from "@/lib/audio/useRegistratore";
import { salvaMemoria } from "@/lib/offline/db";
import { avviaCoda, elaboraCoda, type StatoCoda } from "@/lib/offline/queue";
import { ensureSession } from "@/lib/supabase/auth";
import {
  contributiRimanenti,
  leggiLimiti,
  LIMITI_PREDEFINITI,
  type Limiti,
} from "@/lib/queries/settings";
import styles from "./CatturaMemoria.module.css";

type Fase = "registra" | "riascolta" | "dati";

/**
 * Cattura di una memoria, prima di qualunque accesso.
 *
 * Ordine deliberato: si registra PRIMA, si compilano i dati DOPO. Chi raccoglie
 * una testimonianza non può fermare un anziano che ha iniziato a parlare per
 * riempire un modulo.
 *
 * I limiti (durata, lunghezza, quantità) arrivano dal database e vengono
 * mostrati PRIMA: la registrazione si ferma da sola al tetto, così nessuna
 * testimonianza viene persa per un rifiuto tardivo.
 */
export function CatturaMemoria() {
  const t = useTranslations("cattura");

  const [limiti, setLimiti] = useState<Limiti>(LIMITI_PREDEFINITI);
  const [rimanenti, setRimanenti] = useState<number | null>(null);

  const {
    stato,
    durataMs,
    registrazione,
    errore,
    fermataDalLimite,
    analyserRef,
    avvia,
    ferma,
    annulla,
  } = useRegistratore(limiti.audioDurataMassimaMs);

  const [fase, setFase] = useState<Fase>("registra");
  const [nomeNarratore, setNomeNarratore] = useState("");
  const [annoNascita, setAnnoNascita] = useState("");
  const [nota, setNota] = useState("");
  // Dichiarazione per-contenuto. provenienza guida i due percorsi.
  const [provenienza, setProvenienza] = useState<"mio" | "altro" | null>(null);
  const [confermaMia, setConfermaMia] = useState(false);   // percorso "è mio", un tocco
  const [permesso, setPermesso] = useState(false);         // "altro": ho il permesso
  const [consensoVoce, setConsensoVoce] = useState(false); // "altro": consenso alla voce
  const [veridicitaAltro, setVeridicitaAltro] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvata, setSalvata] = useState(false);
  const [coda, setCoda] = useState<StatoCoda | null>(null);

  // La sessione anonima parte in sottofondo: nessuna schermata di accesso.
  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
        setLimiti(await leggiLimiti());
        setRimanenti(await contributiRimanenti());
      } catch {
        // Senza rete si registra lo stesso: valgono i limiti predefiniti.
      }
    })();
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

  const restanoMs = Math.max(0, limiti.audioDurataMassimaMs - durataMs);
  const quotaEsaurita = rimanenti !== null && rimanenti <= 0;

  // La dichiarazione è completa? Un tocco se è mia; le tre conferme se è altrui.
  const dichiarazioneOk =
    provenienza === "mio"
      ? confermaMia
      : provenienza === "altro"
        ? permesso && consensoVoce && veridicitaAltro
        : false;

  async function salva() {
    if (!registrazione || !dichiarazioneOk) return;
    setSalvataggio(true);
    try {
      const mia = provenienza === "mio";
      const anno = annoNascita.trim() === "" ? null : Number(annoNascita);
      await salvaMemoria({
        id: crypto.randomUUID(),
        blob: registrazione.blob,
        mimeType: registrazione.mimeType,
        durataMs: registrazione.durataMs,
        creataIl: Date.now(),
        // Se è la mia storia, il narratore sono io: niente nome del testimone.
        narratoreNome: mia ? null : nomeNarratore.trim() || null,
        narratoreAnnoNascita: mia ? null : (Number.isFinite(anno) ? anno : null),
        // Consenso alla voce: implicito se è mia, esplicito se è di un altro.
        consenso: mia ? true : consensoVoce,
        nota: nota.trim() || null,
        poiId: null,
        vocePropria: mia,
        permessoTerzi: mia ? false : permesso,
        veridicita: mia ? true : veridicitaAltro,
        stato: "in_attesa",
        tentativi: 0,
        ultimoErrore: null,
      });
      setSalvata(true);
      void elaboraCoda();
      setRimanenti((r) => (r === null ? null : Math.max(0, r - 1)));
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
    setProvenienza(null);
    setConfermaMia(false);
    setPermesso(false);
    setConsensoVoce(false);
    setVeridicitaAltro(false);
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

      {quotaEsaurita && <p className={styles.errore}>{t("limiti.quotaEsaurita")}</p>}

      {/* --- Registrazione --- */}
      {fase === "registra" && (
        <div className={styles.blocco}>
          <div className={styles.onda}>
            <FormaOnda analyserRef={analyserRef} attiva={stato === "registrazione"} />
          </div>

          <p className={styles.timer} aria-live="polite">
            {formattaDurata(durataMs)}
          </p>

          <p className={styles.aiuto}>
            {stato === "registrazione"
              ? t("limiti.restano", { tempo: formattaDurata(restanoMs) })
              : t("limiti.durataMassima", {
                  minuti: Math.round(limiti.audioDurataMassimaMs / 60000),
                })}
            {rimanenti !== null && ` · ${t("limiti.rimanentiMese", { n: rimanenti })}`}
          </p>

          {stato === "registrazione" ? (
            <button className={styles.registraAttivo} onClick={ferma}>
              {t("azioni.ferma")}
            </button>
          ) : (
            <button
              className={styles.registra}
              onClick={() => void avvia()}
              disabled={quotaEsaurita}
            >
              {t("azioni.registra")}
            </button>
          )}
        </div>
      )}

      {/* --- Riascolto --- */}
      {fase === "riascolta" && registrazione && urlRiascolto && (
        <div className={styles.blocco}>
          {fermataDalLimite && (
            <p className={styles.avviso}>
              {t("limiti.fermataAutomatica", {
                minuti: Math.round(limiti.audioDurataMassimaMs / 60000),
              })}
            </p>
          )}
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

      {/* --- Dichiarazione: una domanda sola, poi il percorso leggero o pesante --- */}
      {fase === "dati" && (
        <div className={styles.blocco}>
          {/* La domanda unica. */}
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

          {/* Percorso "è mio": un solo tocco. */}
          {provenienza === "mio" && (
            <label className={styles.consenso}>
              <input
                type="checkbox"
                checked={confermaMia}
                onChange={(e) => setConfermaMia(e.target.checked)}
              />
              <span>{t("dichiarazione.confermaMia")}</span>
            </label>
          )}

          {/* Percorso "è di un'altra persona": l'avviso obbligatorio. */}
          {provenienza === "altro" && (
            <>
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

              <p className={styles.avvisoPesante}>{t("dichiarazione.avvisoTerzi")}</p>

              <label className={styles.consenso}>
                <input
                  type="checkbox"
                  checked={permesso}
                  onChange={(e) => setPermesso(e.target.checked)}
                />
                <span>{t("dichiarazione.hoPermesso")}</span>
              </label>
              <label className={styles.consenso}>
                <input
                  type="checkbox"
                  checked={consensoVoce}
                  onChange={(e) => setConsensoVoce(e.target.checked)}
                />
                <span>{t("dichiarazione.consensoVoce")}</span>
              </label>
              <label className={styles.consenso}>
                <input
                  type="checkbox"
                  checked={veridicitaAltro}
                  onChange={(e) => setVeridicitaAltro(e.target.checked)}
                />
                <span>{t("dichiarazione.veridicita")}</span>
              </label>
            </>
          )}

          {/* Nota di chi raccoglie: sempre disponibile. */}
          {provenienza && (
            <label className={styles.campo}>
              <span>{t("campi.nota")}</span>
              <textarea
                rows={3}
                value={nota}
                maxLength={limiti.testoLunghezzaMassima}
                onChange={(e) => setNota(e.target.value)}
                placeholder={t("campi.notaEsempio")}
              />
              <small className={styles.aiuto}>
                {t("campi.notaAiuto")}{" "}
                <span className={styles.contatore}>
                  {nota.length}/{limiti.testoLunghezzaMassima}
                </span>
              </small>
            </label>
          )}

          {provenienza && <p className={styles.registroPubblico}>{t("registro")}</p>}

          <div className={styles.azioni}>
            <button className={styles.secondario} onClick={() => setFase("riascolta")}>
              {t("azioni.indietro")}
            </button>
            <button
              className={styles.primario}
              onClick={() => void salva()}
              disabled={!dichiarazioneOk || salvataggio}
            >
              {salvataggio ? t("azioni.salvataggio") : t("azioni.pubblica")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
