"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import styles from "./PiePagina.module.css";

/**
 * Link sempre raggiungibili a Privacy, Termini, Cookie e alle impostazioni.
 * Discreto, in fondo a ogni pagina.
 */
export function PiePagina() {
  const t = useTranslations("piepagina");
  return (
    <footer className={styles.pie}>
      <p className={styles.prova}>{t("prova")}</p>
      <nav className={styles.link}>
        <Link href="/privacy">{t("privacy")}</Link>
        <Link href="/termini">{t("termini")}</Link>
        <Link href="/cookie">{t("cookie")}</Link>
        <Link href="/impostazioni">{t("impostazioni")}</Link>
      </nav>
    </footer>
  );
}
