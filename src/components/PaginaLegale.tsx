"use client";

import { useEffect, useState } from "react";
import { leggiTesto, type TestoLegale, type TipoDoc } from "@/lib/queries/legal";
import styles from "./PaginaLegale.module.css";

/**
 * Pagina informativa (termini / privacy / cookie).
 *
 * Il testo arriva dal database (versionato). Per ora è un SEGNAPOSTO: quando
 * arriveranno i testi veri basterà aggiornarli lì, senza toccare il codice.
 */
export function PaginaLegale({ tipo }: { tipo: TipoDoc }) {
  const [testo, setTesto] = useState<TestoLegale | null | "errore">(null);

  useEffect(() => {
    void leggiTesto(tipo).then(
      (t) => setTesto(t),
      () => setTesto("errore"),
    );
  }, [tipo]);

  return (
    <main className={styles.contenitore}>
      {testo === null && <p>…</p>}
      {testo === "errore" && <p>Documento non disponibile.</p>}
      {testo && testo !== "errore" && (
        <>
          <h1 className={styles.titolo}>{testo.titolo}</h1>
          <p className={styles.versione}>versione {testo.versione}</p>
          <div className={styles.corpo}>{testo.corpo}</div>
        </>
      )}
    </main>
  );
}
