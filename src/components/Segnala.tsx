"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  segnalaContenuto,
  type MotivoSegnalazione,
} from "@/lib/queries/legal";
import styles from "./Segnala.module.css";

const MOTIVI: MotivoSegnalazione[] = [
  "falso_ingannevole",
  "senza_permesso",
  "offensivo",
  "altro",
];

/**
 * Azione "Segnala" su un racconto. Discreta accanto al contenuto; le opzioni
 * (motivi) compaiono solo al tocco. Le segnalazioni si accumulano e, oltre una
 * soglia, il racconto torna automaticamente in revisione (lato server).
 */
export function Segnala({ contributionId }: { contributionId: string }) {
  const t = useTranslations("segnala");
  const [aperto, setAperto] = useState(false);
  const [fatto, setFatto] = useState(false);

  async function segnala(motivo: MotivoSegnalazione) {
    try {
      await segnalaContenuto(contributionId, motivo);
      setFatto(true);
      setAperto(false);
    } catch {
      // Silenzioso: una segnalazione non riuscita non è un errore per l'utente.
      setAperto(false);
    }
  }

  if (fatto) {
    return <span className={styles.grazie}>{t("grazie")}</span>;
  }

  return (
    <span className={styles.contenitore}>
      <button className={styles.azione} onClick={() => setAperto((v) => !v)}>
        {t("segnala")}
      </button>
      {aperto && (
        <span className={styles.menu} role="menu">
          <span className={styles.intestazione}>{t("perche")}</span>
          {MOTIVI.map((m) => (
            <button
              key={m}
              className={styles.motivo}
              onClick={() => void segnala(m)}
              role="menuitem"
            >
              {t(`motivi.${m}`)}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
