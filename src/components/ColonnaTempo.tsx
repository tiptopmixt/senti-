"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cosaESuccessoQui, type VoceTempo } from "@/lib/queries/timeline";
import { urlAudioFirmato } from "@/lib/queries/contributions";
import styles from "./ColonnaTempo.module.css";

interface Props {
  lon: number;
  lat: number;
  /** Nome del luogo toccato, se noto (per l'intestazione). */
  nomeLuogo?: string;
  onChiudi?: () => void;
}

/**
 * "Cosa è successo qui": la colonna verticale nel tempo.
 *
 * Regola editoriale visibile: i due livelli non si fondono. Gli eventi delle
 * campagne hanno la marca della certezza e le fonti; le memorie hanno la voce
 * del testimone e l'audio. Stessa linea del tempo, resa diversa.
 *
 * Se non c'è nulla nel raggio, lo si dice con onestà e si invita a essere la
 * prima voce di quel luogo.
 */
export function ColonnaTempo({ lon, lat, nomeLuogo, onChiudi }: Props) {
  const t = useTranslations("qui");
  const [voci, setVoci] = useState<VoceTempo[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setVoci(null);
    setErrore(null);
    cosaESuccessoQui(lon, lat)
      .then((v) => vivo && setVoci(v))
      .catch((e) => vivo && setErrore(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [lon, lat]);

  return (
    <section className={styles.pannello} role="dialog" aria-modal="true">
      <header className={styles.intestazione}>
        <div>
          <p className={styles.occhiello}>{t("occhiello")}</p>
          <h2 className={styles.titolo}>{nomeLuogo ?? t("questoLuogo")}</h2>
        </div>
        {onChiudi && (
          <button className={styles.chiudi} onClick={onChiudi} aria-label={t("chiudi")}>
            ✕
          </button>
        )}
      </header>

      {errore && <p className={styles.errore}>{errore}</p>}

      {voci === null && !errore && <p className={styles.attesa}>{t("caricamento")}</p>}

      {/* Stato vuoto: onesto, e un invito. */}
      {voci !== null && voci.length === 0 && (
        <div className={styles.vuoto}>
          <p className={styles.vuotoTitolo}>{t("vuoto.titolo")}</p>
          <p className={styles.vuotoTesto}>{t("vuoto.testo")}</p>
          <Link className={styles.invito} href="/racconta">
            {t("vuoto.invito")}
          </Link>
        </div>
      )}

      {voci !== null && voci.length > 0 && (
        <ol className={styles.colonna}>
          {voci.map((v) => (
            <VoceRiga key={`${v.tipo}-${v.id}`} voce={v} />
          ))}
        </ol>
      )}
    </section>
  );
}

function VoceRiga({ voce }: { voce: VoceTempo }) {
  const t = useTranslations("qui");
  const campagna = voce.tipo === "campagna";

  return (
    <li className={campagna ? styles.rigaCampagna : styles.rigaMemoria}>
      <span className={styles.puntoLinea} aria-hidden="true" />
      <div className={styles.contenuto}>
        <div className={styles.riga1}>
          <span className={styles.anno}>{voce.anno ?? t("senzaData")}</span>
          {campagna ? (
            <span className={`${styles.marca} ${styles[`marca_${voce.certezza}`]}`}>
              {t(`livello.${voce.tipo}`)} · {t(`certezza.${voce.certezza}`)}
            </span>
          ) : (
            <span className={styles.marcaMemoria}>{t("livello.memoria")}</span>
          )}
        </div>

        {voce.titolo && <p className={styles.titoloVoce}>{voce.titolo}</p>}
        {voce.sottotitolo && <p className={styles.sottotitolo}>{voce.sottotitolo}</p>}
        {voce.testo && <p className={styles.testoVoce}>{voce.testo}</p>}

        {/* L'audio è la memoria: se c'è, viene prima del testo di servizio. */}
        {voce.tipo === "memoria" && voce.media_path && (
          <PlayerMemoria mediaPath={voce.media_path} />
        )}

        {voce.tipo === "memoria" && voce.text_source === "automatica" && (
          <p className={styles.origineTesto}>{t("origine.automatica")}</p>
        )}
        {voce.tipo === "memoria" && voce.text_source === "raccoglitore" && voce.testo && (
          <p className={styles.origineTesto}>{t("origine.raccoglitore")}</p>
        )}
      </div>
    </li>
  );
}

/** Player su richiesta: l'URL firmato si chiede solo quando si preme play. */
function PlayerMemoria({ mediaPath }: { mediaPath: string }) {
  const t = useTranslations("qui");
  const [url, setUrl] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function chiediUrl() {
    setInCorso(true);
    const u = await urlAudioFirmato(mediaPath);
    setUrl(u);
    setInCorso(false);
  }

  if (url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio className={styles.player} src={url} controls autoPlay preload="none" />;
  }

  return (
    <button className={styles.ascolta} onClick={() => void chiediUrl()} disabled={inCorso}>
      {inCorso ? t("caricamento") : `▶ ${t("ascolta")}`}
    </button>
  );
}
