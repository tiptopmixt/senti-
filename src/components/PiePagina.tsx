"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SelettoreLingua } from "./SelettoreLingua";
import { Condividi } from "./Condividi";
import styles from "./PiePagina.module.css";

/**
 * Link sempre raggiungibili a Privacy, Termini, Cookie, impostazioni, lingua e
 * "Condividi l'app". Discreto, in fondo a ogni pagina.
 */
export function PiePagina() {
  const t = useTranslations();
  const locale = useLocale();

  // Link alla home dell'app nella lingua corrente (con il base path del sito).
  const [homeUrl, setHomeUrl] = useState<string | undefined>();
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    setHomeUrl(`${window.location.origin}${base}/${locale}/`);
  }, [locale]);

  return (
    <footer className={styles.pie}>
      <p className={styles.prova}>{t("piepagina.prova")}</p>
      <nav className={styles.link}>
        <Link href="/privacy">{t("piepagina.privacy")}</Link>
        <Link href="/termini">{t("piepagina.termini")}</Link>
        <Link href="/cookie">{t("piepagina.cookie")}</Link>
        <Link href="/impostazioni">{t("piepagina.impostazioni")}</Link>
      </nav>
      <div className={styles.azioniPie}>
        <Condividi
          url={homeUrl}
          titolo={t("app.name")}
          testo={t("app.tagline")}
          etichetta={t("condividi.condividiApp")}
        />
        <SelettoreLingua />
      </div>
    </footer>
  );
}
