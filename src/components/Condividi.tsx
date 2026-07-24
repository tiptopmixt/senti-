"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import qrcode from "qrcode-generator";
import styles from "./Condividi.module.css";

interface Props {
  /** Cosa condividere. Default: l'indirizzo corrente. */
  url?: string;
  titolo?: string;
}

/**
 * Pulsante condividi: una piccola icona discreta che apre le opzioni.
 *
 * Il canale reale per questi tester è WhatsApp, ma non tutti stanno vicini:
 * chi è di persona può mostrare un QR code da inquadrare, chi è lontano riceve
 * il link. L'icona non è invadente — le scelte compaiono solo quando serve.
 */
export function Condividi({ url, titolo }: Props) {
  const t = useTranslations("condividi");
  const [aperto, setAperto] = useState(false);
  const [mostraQr, setMostraQr] = useState(false);
  const [copiato, setCopiato] = useState(false);

  // In assenza di un url esplicito si usa l'indirizzo corrente.
  const indirizzo = useMemo(() => {
    if (url) return url;
    if (typeof window !== "undefined") return window.location.href;
    return "";
  }, [url]);

  const testoCondivisione = titolo ? `${titolo} — ${indirizzo}` : indirizzo;

  // QR come SVG: nitido a ogni dimensione, nessun canvas, nessun servizio esterno.
  const qrSvg = useMemo(() => {
    if (!mostraQr || !indirizzo) return null;
    const qr = qrcode(0, "M");
    qr.addData(indirizzo);
    qr.make();
    // createSvgTag genera un SVG scalabile; cellSize 0 + scale via CSS.
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [mostraQr, indirizzo]);

  function apriWhatsApp() {
    const u = `https://wa.me/?text=${encodeURIComponent(testoCondivisione)}`;
    window.open(u, "_blank", "noopener,noreferrer");
    chiudi();
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(indirizzo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      // Se la clipboard è negata, il QR e WhatsApp restano comunque.
    }
  }

  function chiudi() {
    setAperto(false);
    setMostraQr(false);
  }

  return (
    <div className={styles.contenitore}>
      <button
        className={styles.icona}
        onClick={() => setAperto((v) => !v)}
        aria-label={t("apri")}
        aria-expanded={aperto}
      >
        {/* Icona condividi, essenziale */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.1 10.9 15.9 6.1M8.1 13.1l7.8 4.8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>

      {aperto && (
        <>
          <button className={styles.velo} aria-label={t("chiudi")} onClick={chiudi} />
          <div className={styles.foglio} role="menu">
            {!mostraQr ? (
              <>
                <button className={styles.voce} onClick={apriWhatsApp} role="menuitem">
                  <span className={styles.vociIcona} aria-hidden="true">💬</span>
                  {t("whatsapp")}
                </button>
                <button className={styles.voce} onClick={() => void copiaLink()} role="menuitem">
                  <span className={styles.vociIcona} aria-hidden="true">🔗</span>
                  {copiato ? t("copiato") : t("copiaLink")}
                </button>
                <button className={styles.voce} onClick={() => setMostraQr(true)} role="menuitem">
                  <span className={styles.vociIcona} aria-hidden="true">▦</span>
                  {t("qr")}
                </button>
              </>
            ) : (
              <div className={styles.qrRiquadro}>
                <p className={styles.qrTitolo}>{t("qrIstruzione")}</p>
                {/* qrcode-generator produce un markup SVG affidabile e locale. */}
                <div
                  className={styles.qr}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }}
                />
                <button className={styles.indietro} onClick={() => setMostraQr(false)}>
                  {t("indietro")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
