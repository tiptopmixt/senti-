"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ensureSession } from "@/lib/supabase/auth";
import { accettaDocumento, statoConsensi, type StatoConsensi } from "@/lib/queries/legal";
import styles from "./Onboarding.module.css";

type Passo = "intro" | "patto" | "cookie";

/**
 * Onboarding: le cose che non cambiano si chiedono UNA volta.
 *
 * Compare solo se manca l'accettazione della versione attiva di termini,
 * privacy o cookie. Se un testo cambia versione, ricompare (reinformare).
 * La privacy è un'informativa da leggere, i termini si accettano, il cookie è
 * una scelta — senza trucchi per spingere all'accettazione.
 */
export function Onboarding() {
  const t = useTranslations("onboarding");
  const [stato, setStato] = useState<StatoConsensi | null>(null);
  const [visibile, setVisibile] = useState(false);
  const [passo, setPasso] = useState<Passo>("intro");

  useEffect(() => {
    void (async () => {
      try {
        await ensureSession(); // login anonimo alla prima apertura
        const s = await statoConsensi();
        setStato(s);
        const serve =
          s.termini?.da_mostrare || s.privacy?.da_mostrare || s.cookie?.da_mostrare;
        setVisibile(Boolean(serve));
      } catch {
        // Senza rete l'onboarding riprova alla prossima apertura.
      }
    })();
  }, []);

  if (!visibile || !stato) return null;

  async function accettaPatto() {
    // Termini: si accettano. Privacy: si registra la presa visione della versione.
    if (stato?.termini) await accettaDocumento("termini", stato.termini.versione_attiva);
    if (stato?.privacy) await accettaDocumento("privacy", stato.privacy.versione_attiva);
    setPasso("cookie");
  }

  async function scegliCookie(statistiche: boolean) {
    if (stato?.cookie) {
      await accettaDocumento("cookie", stato.cookie.versione_attiva, { statistiche });
    }
    setVisibile(false);
  }

  return (
    <div className={styles.velo}>
      <div className={styles.riquadro} role="dialog" aria-modal="true">
        {passo === "intro" && (
          <div className={styles.contenuto}>
            <h1 className={styles.titolo}>{t("intro.titolo")}</h1>
            <p className={styles.testo}>{t("intro.comeFunziona")}</p>
            <p className={styles.testo}>{t("intro.anonimo")}</p>
            <p className={styles.regola}>{t("intro.regola")}</p>
            <button className={styles.primario} onClick={() => setPasso("patto")}>
              {t("intro.hoCapito")}
            </button>
          </div>
        )}

        {passo === "patto" && (
          <div className={styles.contenuto}>
            <h2 className={styles.titolo}>{t("patto.titolo")}</h2>
            <p className={styles.testo}>{t("patto.testo")}</p>
            <p className={styles.link}>
              <Link href="/termini" target="_blank">{t("patto.leggiTermini")}</Link>
              {" · "}
              <Link href="/privacy" target="_blank">{t("patto.leggiPrivacy")}</Link>
            </p>
            <button className={styles.primario} onClick={() => void accettaPatto()}>
              {t("patto.accetto")}
            </button>
          </div>
        )}

        {passo === "cookie" && (
          <div className={styles.contenuto}>
            <h2 className={styles.titolo}>{t("cookie.titolo")}</h2>
            <p className={styles.testo}>{t("cookie.testo")}</p>
            <p className={styles.link}>
              <Link href="/cookie" target="_blank">{t("cookie.dettagli")}</Link>
            </p>
            {/* Due bottoni con lo stesso peso: nessuna spinta all'accettazione. */}
            <div className={styles.sceltaCookie}>
              <button className={styles.sceltaPari} onClick={() => void scegliCookie(false)}>
                {t("cookie.rifiuta")}
              </button>
              <button className={styles.sceltaPari} onClick={() => void scegliCookie(true)}>
                {t("cookie.accetta")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
