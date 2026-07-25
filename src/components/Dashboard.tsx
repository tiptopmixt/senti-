"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ensureSession } from "@/lib/supabase/auth";
import { myDashboard, type Dashboard as DatiDashboard } from "@/lib/queries/dashboard";
import styles from "./Dashboard.module.css";

/**
 * "/io": il registro reso visibile.
 *
 * Ordine deliberato, dal prompt: in cima ciò che dà riconoscimento (citazioni,
 * luoghi di cui sei l'unica voce), poi punti e quota, in fondo i conteggi. Chi
 * non ha ancora contribuito non vede una schermata di zeri, ma il luogo senza
 * memorie più vicino e un invito.
 */
export function Dashboard() {
  const t = useTranslations("io");
  const [dati, setDati] = useState<DatiDashboard | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
        // Se il GPS è disponibile, lo stato vuoto può proporre il luogo vicino.
        const coord = await posizione();
        setDati(await myDashboard(coord?.lon, coord?.lat));
      } catch (e) {
        setErrore(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (errore) {
    return (
      <section className={styles.contenitore}>
        <p className={styles.errore}>{errore}</p>
      </section>
    );
  }
  if (!dati) {
    return (
      <section className={styles.contenitore}>
        <p className={styles.attesa}>{t("caricamento")}</p>
      </section>
    );
  }

  // Stato vuoto: non sei zeri, ma il luogo più vicino da raccontare.
  if ((dati.contributi ?? 0) === 0) {
    const luogo = dati.luogo_da_raccontare_vicino;
    return (
      <section className={styles.contenitore}>
        <h1 className={styles.titolo}>{t("titolo")}</h1>
        <div className={styles.vuoto}>
          <p className={styles.vuotoTesto}>{t("vuoto.intro")}</p>
          {luogo ? (
            <>
              <p className={styles.vuotoLuogo}>{luogo.name}</p>
              <p className={styles.vuotoTesto}>{t("vuoto.vicino")}</p>
            </>
          ) : (
            <p className={styles.vuotoTesto}>{t("vuoto.generico")}</p>
          )}
          <Link className={styles.invito} href="/racconta">
            {t("vuoto.invito")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.contenitore}>
      <h1 className={styles.titolo}>{t("titolo")}</h1>

      {/* In cima: riconoscimento. */}
      <div className={styles.inCima}>
        <Rilievo
          valore={dati.citazioni ?? 0}
          etichetta={t("citazioni")}
          nota={t("citazioniNota")}
        />
        <Rilievo
          valore={dati.luoghi_unica_voce ?? 0}
          etichetta={t("unicaVoce")}
          nota={t("unicaVoceNota")}
        />
      </div>

      {/* Punti e quota sul registro. */}
      <div className={styles.registro}>
        <div className={styles.punti}>
          <span className={styles.puntiNum}>{dati.punti ?? 0}</span>
          <span className={styles.puntiEtichetta}>{t("punti")}</span>
        </div>
        <p className={styles.quota}>
          {t("quota", { pct: (dati.quota_percento ?? 0).toString() })}
        </p>
        <p className={styles.registroNota}>{t("registroNota")}</p>
      </div>

      {/* In fondo: conteggi. Solo aggregati. */}
      <div className={styles.conteggi}>
        <Conteggio valore={dati.pois ?? 0} etichetta={t("conteggi.pois")} />
        <Conteggio valore={dati.contributi ?? 0} etichetta={t("conteggi.contributi")} />
        <Conteggio valore={dati.reazioni ?? 0} etichetta={t("conteggi.reazioni")} />
        <Conteggio valore={dati.visite ?? 0} etichetta={t("conteggi.visite")} />
      </div>
      <p className={styles.privacyNota}>{t("privacyNota")}</p>
    </section>
  );
}

function Rilievo({
  valore,
  etichetta,
  nota,
}: {
  valore: number;
  etichetta: string;
  nota: string;
}) {
  return (
    <div className={styles.rilievo}>
      <span className={styles.rilievoNum}>{valore}</span>
      <span className={styles.rilievoEtichetta}>{etichetta}</span>
      <span className={styles.rilievoNota}>{nota}</span>
    </div>
  );
}

function Conteggio({ valore, etichetta }: { valore: number; etichetta: string }) {
  return (
    <div className={styles.conteggio}>
      <span className={styles.conteggioNum}>{valore}</span>
      <span className={styles.conteggioEtichetta}>{etichetta}</span>
    </div>
  );
}

/** Posizione dal GPS, se concessa. Non blocca: se manca, si prosegue. */
function posizione(): Promise<{ lon: number; lat: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lon: p.coords.longitude, lat: p.coords.latitude }),
      () => resolve(null),
      { timeout: 4000 },
    );
  });
}
