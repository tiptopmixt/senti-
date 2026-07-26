"use client";

import { useTranslations } from "next-intl";
import styles from "./AvvisoIA.module.css";

/**
 * Striscia sempre visibile, fissata in alto su ogni pagina: l'app è fatta con
 * l'IA e può contenere errori. È un avviso di trasparenza, non deve mai sparire.
 */
export function AvvisoIA() {
  const t = useTranslations("piepagina");
  return (
    <div className={styles.striscia} role="note">
      🤖 {t("avvisoIA")}
    </div>
  );
}
