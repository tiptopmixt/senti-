"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import qrcode from "qrcode-generator";
import styles from "./Condividi.module.css";

interface Props {
  /** Cosa condividere. Default: l'indirizzo corrente. */
  url?: string;
  titolo?: string;
  /** Descrizione per la condivisione nativa (una riga su cos'è). */
  testo?: string;
  /** Se presente, il trigger è un pulsante testuale (es. "Condividi l'app"). */
  etichetta?: string;
}

/**
 * Condividi: apre la condivisione NATIVA del telefono (WhatsApp, messaggi…) e
 * offre un QR code (per chi è di persona). Il QR si genera in locale — nessun
 * dato esce dall'app — si ingrandisce a schermo intero e si salva come immagine
 * per stamparlo (cartelli, museo, biblioteca).
 */
export function Condividi({ url, titolo, testo, etichetta }: Props) {
  const t = useTranslations("condividi");
  const [aperto, setAperto] = useState(false);
  const [mostraQr, setMostraQr] = useState(false);
  const [qrPieno, setQrPieno] = useState(false);
  const [copiato, setCopiato] = useState(false);

  const indirizzo = useMemo(() => {
    if (url) return url;
    if (typeof window !== "undefined") return window.location.href;
    return "";
  }, [url]);

  const testoCondivisione = [titolo, testo, indirizzo].filter(Boolean).join(" — ");

  const qrSvg = useMemo(() => {
    if (!(mostraQr || qrPieno) || !indirizzo) return null;
    const qr = qrcode(0, "M");
    qr.addData(indirizzo);
    qr.make();
    const count = qr.getModuleCount();
    const cell = 6;
    const margin = 2;
    const dim = (count + margin * 2) * cell;
    let rects = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          rects += `<rect x="${(c + margin) * cell}" y="${(r + margin) * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
        }
      }
    }
    const cx = dim / 2;
    const cy = dim / 2;
    const logoR = dim * 0.11;
    return `<svg viewBox="0 0 ${dim} ${dim}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${dim}" height="${dim}" fill="#fff"/>` +
      rects +
      `<circle cx="${cx}" cy="${cy}" r="${logoR}" fill="#fff"/>` +
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${logoR * 1.3}">⚔️</text>` +
      `</svg>`;
  }, [mostraQr, qrPieno, indirizzo]);

  function chiudi() {
    setAperto(false);
    setMostraQr(false);
    setQrPieno(false);
  }

  // Condivisione nativa del sistema (dove disponibile).
  async function condividiNativo() {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: titolo, text: testo, url: indirizzo });
        chiudi();
        return;
      } catch {
        /* annullato: resta il foglio */
      }
    } else {
      apriWhatsApp();
    }
  }

  function apriWhatsApp() {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(testoCondivisione)}`,
      "_blank",
      "noopener,noreferrer",
    );
    chiudi();
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(indirizzo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      /* clipboard negata: restano QR e WhatsApp */
    }
  }

  // Salva il QR come PNG ad alta risoluzione (per la stampa), generato in locale.
  function salvaQr() {
    const qr = qrcode(0, "M");
    qr.addData(indirizzo);
    qr.make();
    const count = qr.getModuleCount();
    const margine = 4;
    const cella = 16;
    const dim = (count + margine * 2) * cella;
    const canvas = document.createElement("canvas");
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + margine) * cella, (r + margine) * cella, cella, cella);
      }
    }
    const cx = dim / 2;
    const cy = dim / 2;
    const logoR = dim * 0.11;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, logoR, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.round(logoR * 1.3)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚔️", cx, cy);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "senti-qr.png";
    a.click();
  }

  return (
    <div className={styles.contenitore}>
      {etichetta ? (
        <button className={styles.etichetta} onClick={() => setAperto(true)}>
          <span aria-hidden="true">🔗</span> {etichetta}
        </button>
      ) : (
        <button
          className={styles.icona}
          onClick={() => setAperto((v) => !v)}
          aria-label={t("apri")}
          aria-expanded={aperto}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.1 10.9 15.9 6.1M8.1 13.1l7.8 4.8" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      )}

      {aperto && (
        <>
          <button className={styles.velo} aria-label={t("chiudi")} onClick={chiudi} />
          <div className={styles.foglio} role="menu">
            {!mostraQr ? (
              <>
                <button className={styles.voce} onClick={() => void condividiNativo()} role="menuitem">
                  <span className={styles.vociIcona} aria-hidden="true">📤</span>
                  {t("condividiNativo")}
                </button>
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
                <button
                  className={styles.qr}
                  onClick={() => setQrPieno(true)}
                  aria-label={t("ingrandisci")}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }}
                />
                <div className={styles.qrAzioni}>
                  <button className={styles.indietro} onClick={() => setQrPieno(true)}>
                    {t("ingrandisci")}
                  </button>
                  <button className={styles.indietro} onClick={salvaQr}>
                    {t("salva")}
                  </button>
                </div>
                <button className={styles.indietro} onClick={() => setMostraQr(false)}>
                  {t("indietro")}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* QR a schermo intero, per farlo inquadrare da un altro telefono. */}
      {qrPieno && (
        <div className={styles.qrPieno} role="dialog" aria-modal="true">
          <div
            className={styles.qrPienoImg}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }}
          />
          <div className={styles.qrPienoAzioni}>
            <button className={styles.primarioChiaro} onClick={salvaQr}>
              {t("salva")}
            </button>
            <button className={styles.primarioChiaro} onClick={() => setQrPieno(false)}>
              {t("chiudi")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
