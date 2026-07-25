"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ensureSession } from "@/lib/supabase/auth";
import { accettaDocumento, statoConsensi } from "@/lib/queries/legal";
import styles from "./Impostazioni.module.css";

/**
 * Impostazioni: qui si modifica la scelta cookie fatta all'ingresso.
 * La scelta non è definitiva — si può sempre cambiare.
 */
export function Impostazioni() {
  const t = useTranslations("impostazioni");
  const [statistiche, setStatistiche] = useState<boolean | null>(null);
  const [versione, setVersione] = useState<number | null>(null);
  const [salvato, setSalvato] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
        const s = await statoConsensi();
        setVersione(s.cookie?.versione_attiva ?? 1);
        const det = s.cookie?.dettaglio as { statistiche?: boolean } | null;
        setStatistiche(Boolean(det?.statistiche));
      } catch {
        setStatistiche(false);
      }
    })();
  }, []);

  async function cambia(nuovo: boolean) {
    setStatistiche(nuovo);
    setSalvato(false);
    if (versione != null) {
      await accettaDocumento("cookie", versione, { statistiche: nuovo });
      setSalvato(true);
    }
  }

  return (
    <main className={styles.contenitore}>
      <h1 className={styles.titolo}>{t("titolo")}</h1>

      <section className={styles.sezione}>
        <h2 className={styles.sottotitolo}>{t("cookie.titolo")}</h2>
        <p className={styles.testo}>{t("cookie.tecnici")}</p>

        <label className={styles.riga}>
          <input
            type="checkbox"
            checked={statistiche ?? false}
            onChange={(e) => void cambia(e.target.checked)}
            disabled={statistiche === null}
          />
          <span>{t("cookie.statistiche")}</span>
        </label>

        {salvato && <p className={styles.salvato}>{t("salvato")}</p>}
      </section>
    </main>
  );
}
