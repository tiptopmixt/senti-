"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import styles from "./SelettoreLingua.module.css";

/**
 * Selettore di lingua IT/EN. Cambia il prefisso della lingua mantenendo la
 * stessa pagina. Sta nel footer, quindi è raggiungibile ovunque.
 */
export function SelettoreLingua() {
  const locale = useLocale();
  const t = useTranslations("language");
  const pathname = usePathname();
  const router = useRouter();

  function vai(l: "it" | "en") {
    if (l !== locale) router.replace(pathname, { locale: l });
  }

  return (
    <div className={styles.gruppo} role="group" aria-label={t("switch")}>
      <button
        className={locale === "it" ? styles.attivo : styles.spento}
        onClick={() => vai("it")}
        aria-pressed={locale === "it"}
      >
        IT
      </button>
      <span className={styles.sep} aria-hidden="true">·</span>
      <button
        className={locale === "en" ? styles.attivo : styles.spento}
        onClick={() => vai("en")}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
