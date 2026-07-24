"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  memorieDaModerare,
  moderaMemoria,
  type MemoriaModerazione,
} from "@/lib/queries/moderazione";
import { urlAudioFirmato } from "@/lib/queries/contributions";
import { profiloCorrente } from "@/lib/supabase/demo";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./CodaModerazione.module.css";

/**
 * La coda di moderazione della curatrice.
 *
 * L'IA (pulsante "Chiedi aiuto") suggerisce; la curatrice decide. Approva e
 * Rifiuta sono gli unici atti che cambiano lo stato, e li compie una persona.
 */
export function CodaModerazione() {
  const t = useTranslations("cura");
  const [curatrice, setCuratrice] = useState<boolean | null>(null);
  const [memorie, setMemorie] = useState<MemoriaModerazione[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    try {
      setMemorie(await memorieDaModerare());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const p = await profiloCorrente();
      setCuratrice(p?.is_curator ?? false);
      if (p?.is_curator) await ricarica();
    })();
  }, [ricarica]);

  async function modera(id: string, approva: boolean) {
    setInCorso(id);
    setErrore(null);
    try {
      await moderaMemoria(id, approva);
      setMemorie((m) => m.filter((x) => x.id !== id));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  if (curatrice === null) {
    return <p className={styles.stato}>{t("caricamento")}</p>;
  }
  if (!curatrice) {
    return (
      <section className={styles.contenitore}>
        <h1 className={styles.titolo}>{t("titolo")}</h1>
        <p className={styles.stato}>{t("nonCuratrice")}</p>
      </section>
    );
  }

  return (
    <section className={styles.contenitore}>
      <h1 className={styles.titolo}>{t("titolo")}</h1>
      <p className={styles.sottotitolo}>
        {memorie.length === 0 ? t("vuota") : t("conteggio", { n: memorie.length })}
      </p>

      {errore && <p className={styles.errore}>{errore}</p>}

      <ul className={styles.lista}>
        {memorie.map((m) => (
          <RigaMemoria
            key={m.id}
            memoria={m}
            occupato={inCorso === m.id}
            onModera={(approva) => void modera(m.id, approva)}
          />
        ))}
      </ul>
    </section>
  );
}

function RigaMemoria({
  memoria,
  occupato,
  onModera,
}: {
  memoria: MemoriaModerazione;
  occupato: boolean;
  onModera: (approva: boolean) => void;
}) {
  const t = useTranslations("cura");
  const [urlAudio, setUrlAudio] = useState<string | null>(null);
  const [aiuto, setAiuto] = useState<string | null>(null);
  const [aiutoInCorso, setAiutoInCorso] = useState(false);
  const testo = memoria.transcript ?? memoria.body;

  async function ascolta() {
    if (!memoria.media_path) return;
    setUrlAudio(await urlAudioFirmato(memoria.media_path));
  }

  async function chiediAiuto() {
    if (!memoria.poi_id) return;
    setAiutoInCorso(true);
    setAiuto(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("curate", {
        body: { poi_id: memoria.poi_id },
      });
      if (error) throw error;
      setAiuto(data?.suggerimenti ?? t("aiutoVuoto"));
    } catch (e) {
      setAiuto(t("aiutoErrore", { errore: e instanceof Error ? e.message : String(e) }));
    } finally {
      setAiutoInCorso(false);
    }
  }

  return (
    <li className={styles.riga}>
      <div className={styles.metaRiga}>
        <span className={styles.luogo}>{memoria.poi_nome ?? t("senzaLuogo")}</span>
        <span className={styles.tipo}>{t(`tipo.${memoria.kind}`)}</span>
        {!memoria.narrator_consent && (
          <span className={styles.allarme}>{t("senzaConsenso")}</span>
        )}
      </div>

      {memoria.narrator_name && (
        <p className={styles.testimone}>
          {memoria.narrator_name}
          {memoria.narrator_birth_year ? `, ${memoria.narrator_birth_year}` : ""}
          {memoria.event_year ? ` · ${t("evento", { anno: memoria.event_year })}` : ""}
        </p>
      )}

      {testo && <p className={styles.testo}>{testo}</p>}

      {memoria.kind === "audio" && memoria.media_path && (
        urlAudio ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio className={styles.player} src={urlAudio} controls autoPlay preload="none" />
        ) : (
          <button className={styles.ascolta} onClick={() => void ascolta()}>
            ▶ {t("ascolta")}
          </button>
        )
      )}

      {aiuto && <pre className={styles.aiuto}>{aiuto}</pre>}

      <div className={styles.azioni}>
        <button
          className={styles.aiutoBtn}
          onClick={() => void chiediAiuto()}
          disabled={aiutoInCorso || !memoria.poi_id}
        >
          {aiutoInCorso ? t("aiutoInCorso") : t("chiediAiuto")}
        </button>
        <button className={styles.rifiuta} onClick={() => onModera(false)} disabled={occupato}>
          {t("rifiuta")}
        </button>
        <button className={styles.approva} onClick={() => onModera(true)} disabled={occupato}>
          {t("approva")}
        </button>
      </div>
    </li>
  );
}
