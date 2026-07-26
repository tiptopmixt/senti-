"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  contenutiSegnalati,
  moderaContenuto,
  type ContenutoSegnalato,
} from "@/lib/queries/moderazione";
import { urlFotoFirmato } from "@/lib/queries/contributions";
import { profiloCorrente } from "@/lib/supabase/demo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FINDING_EMOJI, type FindingType } from "@/lib/validation";
import styles from "./CodaModerazione.module.css";

/**
 * La coda dei contenuti segnalati.
 *
 * I ritrovamenti sono pubblici subito: qui si interviene a posteriori, solo su
 * segnalazione. L'IA ("Chiedi aiuto") suggerisce; il moderatore decide. Rimuovi
 * e Ripristina sono gli unici atti che cambiano lo stato, e li compie una persona.
 */
export function CodaModerazione() {
  const t = useTranslations("cura");
  const [moderatore, setModeratore] = useState<boolean | null>(null);
  const [contenuti, setContenuti] = useState<ContenutoSegnalato[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    try {
      setContenuti(await contenutiSegnalati());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const p = await profiloCorrente();
      setModeratore(p?.is_moderator ?? false);
      if (p?.is_moderator) await ricarica();
    })();
  }, [ricarica]);

  async function modera(id: string, rimuovi: boolean) {
    setInCorso(id);
    setErrore(null);
    try {
      await moderaContenuto(id, rimuovi);
      // Aggiorna lo stato in lista senza togliere la riga: si può ripristinare.
      setContenuti((c) =>
        c.map((x) => (x.id === id ? { ...x, status: rimuovi ? "rimosso" : "pubblicato" } : x)),
      );
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  if (moderatore === null) {
    return <p className={styles.stato}>{t("caricamento")}</p>;
  }
  if (!moderatore) {
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
        {contenuti.length === 0 ? t("vuota") : t("conteggio", { n: contenuti.length })}
      </p>

      {errore && <p className={styles.errore}>{errore}</p>}

      <ul className={styles.lista}>
        {contenuti.map((c) => (
          <RigaContenuto
            key={c.id}
            contenuto={c}
            occupato={inCorso === c.id}
            onModera={(rimuovi) => void modera(c.id, rimuovi)}
          />
        ))}
      </ul>
    </section>
  );
}

function RigaContenuto({
  contenuto,
  occupato,
  onModera,
}: {
  contenuto: ContenutoSegnalato;
  occupato: boolean;
  onModera: (rimuovi: boolean) => void;
}) {
  const t = useTranslations("cura");
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [aiuto, setAiuto] = useState<string | null>(null);
  const [aiutoInCorso, setAiutoInCorso] = useState(false);

  useEffect(() => {
    if (contenuto.kind === "foto" && contenuto.media_path) {
      void urlFotoFirmato(contenuto.media_path).then(setUrlFoto);
    }
  }, [contenuto.kind, contenuto.media_path]);

  async function chiediAiuto() {
    if (!contenuto.poi_id) return;
    setAiutoInCorso(true);
    setAiuto(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("curate", {
        body: { poi_id: contenuto.poi_id },
      });
      if (error) throw error;
      setAiuto(data?.suggerimenti ?? t("aiutoVuoto"));
    } catch (e) {
      setAiuto(t("aiutoErrore", { errore: e instanceof Error ? e.message : String(e) }));
    } finally {
      setAiutoInCorso(false);
    }
  }

  const rimosso = contenuto.status === "rimosso";

  return (
    <li className={styles.riga} style={rimosso ? { opacity: 0.55 } : undefined}>
      <div className={styles.metaRiga}>
        <span className={styles.luogo}>
          {contenuto.finding_type ? `${FINDING_EMOJI[contenuto.finding_type as FindingType]} ` : ""}
          {contenuto.poi_nome ?? t("senzaLuogo")}
        </span>
        <span className={styles.tipo}>{t(`tipo.${contenuto.kind}`)}</span>
        {contenuto.event_year ? (
          <span className={styles.tipo}>{t("evento", { anno: contenuto.event_year })}</span>
        ) : null}
        {rimosso && <span className={styles.allarme}>{t("rimosso")}</span>}
        {contenuto.segnalazioni > 0 && (
          <span className={styles.allarme}>
            {t("segnalata", { n: contenuto.segnalazioni })}
          </span>
        )}
      </div>

      {contenuto.motivi_segnalazioni && (
        <p className={styles.motiviSegnalazione}>
          {t("motivi")}: {contenuto.motivi_segnalazioni}
        </p>
      )}

      {contenuto.body && <p className={styles.testo}>{contenuto.body}</p>}

      {contenuto.kind === "foto" && urlFoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.player} src={urlFoto} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />
      )}

      {aiuto && <pre className={styles.aiuto}>{aiuto}</pre>}

      <div className={styles.azioni}>
        <button
          className={styles.aiutoBtn}
          onClick={() => void chiediAiuto()}
          disabled={aiutoInCorso || !contenuto.poi_id}
        >
          {aiutoInCorso ? t("aiutoInCorso") : t("chiediAiuto")}
        </button>
        {rimosso ? (
          <button className={styles.approva} onClick={() => onModera(false)} disabled={occupato}>
            {t("ripristina")}
          </button>
        ) : (
          <button className={styles.rifiuta} onClick={() => onModera(true)} disabled={occupato}>
            {t("rimuovi")}
          </button>
        )}
      </div>
    </li>
  );
}
