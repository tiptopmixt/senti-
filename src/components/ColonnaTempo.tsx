"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  contestiPerMemorie,
  cosaESuccessoQui,
  type ContestoStorico,
  type VoceTempo,
} from "@/lib/queries/timeline";
import { urlFotoFirmato } from "@/lib/queries/contributions";
import { FINDING_EMOJI, type FindingType } from "@/lib/validation";
import { registraVisita } from "@/lib/queries/dashboard";
import { Segnala } from "./Segnala";
import styles from "./ColonnaTempo.module.css";

interface Props {
  lon: number;
  lat: number;
  /** Nome del luogo toccato, se noto (per l'intestazione). */
  nomeLuogo?: string;
  /** Id del luogo, se si apre da un POI: serve a registrare la visita. */
  poiId?: string;
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
export function ColonnaTempo({ lon, lat, nomeLuogo, poiId, onChiudi }: Props) {
  const t = useTranslations("qui");
  const [voci, setVoci] = useState<VoceTempo[] | null>(null);
  const [contesti, setContesti] = useState<Map<string, ContestoStorico>>(new Map());
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setVoci(null);
    setContesti(new Map());
    setErrore(null);
    cosaESuccessoQui(lon, lat)
      .then(async (v) => {
        if (!vivo) return;
        setVoci(v);
        const idRitrovamenti = v.filter((x) => x.tipo === "ritrovamento").map((x) => x.id);
        const c = await contestiPerMemorie(idRitrovamenti);
        if (vivo) setContesti(c);
      })
      .catch((e) => vivo && setErrore(e instanceof Error ? e.message : String(e)));
    // Registra la visita al luogo (fire-and-forget, dedup lato server).
    if (poiId) void registraVisita(poiId);
    return () => {
      vivo = false;
    };
  }, [lon, lat, poiId]);

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
            <VoceRiga
              key={`${v.tipo}-${v.id}`}
              voce={v}
              contesto={v.tipo === "ritrovamento" ? contesti.get(v.id) : undefined}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function VoceRiga({
  voce,
  contesto,
}: {
  voce: VoceTempo;
  contesto?: ContestoStorico;
}) {
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
              {t("livello.campagna")} · {t(`certezza.${voce.certezza}`)}
            </span>
          ) : (
            <span className={styles.marcaMemoria}>
              {voce.finding_type ? `${FINDING_EMOJI[voce.finding_type as FindingType]} ` : ""}
              {t("livello.ritrovamento")}
            </span>
          )}
        </div>

        {voce.titolo && <p className={styles.titoloVoce}>{voce.titolo}</p>}
        {voce.sottotitolo && <p className={styles.sottotitolo}>{voce.sottotitolo}</p>}
        {voce.testo && <p className={styles.testoVoce}>{voce.testo}</p>}

        {/* Foto del ritrovamento, se presente. */}
        {voce.tipo === "ritrovamento" && voce.media_path && (
          <FotoRitrovamento mediaPath={voce.media_path} />
        )}

        {/* Segnala: solo sui ritrovamenti degli utenti, non sugli eventi storici. */}
        {voce.tipo === "ritrovamento" && (
          <div className={styles.azioniVoce}>
            <Segnala contributionId={voce.id} />
          </div>
        )}

        {/* Contesto storico: riquadro SEPARATO, aggiunta della piattaforma.
            È chiaramente distinto dal racconto e non ne giudica la verità. */}
        {contesto && (
          <aside className={styles.contesto}>
            <p className={styles.contestoTitolo}>{contesto.titolo}</p>
            <p className={styles.contestoTesto}>{contesto.corpo}</p>
            {contesto.fonte_url && (
              <p className={styles.contestoFonte}>
                {t("contesto.fonte")}:{" "}
                <a href={contesto.fonte_url} target="_blank" rel="noopener noreferrer">
                  {contesto.fonte_nome ?? contesto.fonte_url}
                </a>
              </p>
            )}
            <p className={styles.contestoNota}>{t("contesto.nota")}</p>
          </aside>
        )}
      </div>
    </li>
  );
}

/** Foto su richiesta: l'URL firmato si chiede solo al primo render. */
function FotoRitrovamento({ mediaPath }: { mediaPath: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    void urlFotoFirmato(mediaPath).then(setUrl);
  }, [mediaPath]);

  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.player} src={url} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />;
}
