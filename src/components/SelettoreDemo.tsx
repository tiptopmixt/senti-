"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DEMO_ATTIVO,
  UTENTI_DEMO,
  entraComeDemo,
  profiloCorrente,
} from "@/lib/supabase/demo";
import styles from "./SelettoreDemo.module.css";

/**
 * Selettore utenti demo. Compare SOLO se NEXT_PUBLIC_DEMO=true.
 *
 * Serve alla modalità test: permette di essere Anna, Marco o la Curatrice senza
 * schermate di accesso. In produzione (variabile spenta) non renderizza nulla,
 * come se non esistesse.
 */
export function SelettoreDemo() {
  const t = useTranslations("demo");
  const [aperto, setAperto] = useState(false);
  const [chi, setChi] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    if (!DEMO_ATTIVO) return;
    void profiloCorrente().then((p) => setChi(p?.display_name ?? null));
  }, []);

  if (!DEMO_ATTIVO) return null;

  async function entra(email: string, etichetta: string) {
    setInCorso(true);
    try {
      await entraComeDemo(email);
      setChi(etichetta);
      setAperto(false);
      // Ricarico pieno: così ogni componente rilegge la nuova sessione. Un
      // semplice router.refresh() aggiorna i componenti server ma non lo stato
      // dei componenti client (la coda della curatrice, la mappa, ecc.).
      window.location.reload();
    } catch {
      // In assenza del seed (produzione) non succede nulla.
      setInCorso(false);
    }
  }

  return (
    <div className={styles.contenitore}>
      <button className={styles.pillola} onClick={() => setAperto((v) => !v)}>
        <span className={styles.punto} aria-hidden="true" />
        {chi ? t("sei", { chi }) : t("scegli")}
      </button>

      {aperto && (
        <div className={styles.menu} role="menu">
          <p className={styles.intestazione}>{t("titolo")}</p>
          {UTENTI_DEMO.map((u) => (
            <button
              key={u.chiave}
              className={styles.voce}
              onClick={() => void entra(u.email, u.etichetta)}
              disabled={inCorso}
              role="menuitem"
            >
              <strong>{u.etichetta}</strong>
              <span>{u.descrizione}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
