"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import styles from "./BarraPulsanti.module.css";

type Bordo = "top" | "bottom" | "left" | "right";

interface PosizionePulsante {
  bordo: Bordo;
  ordine: number;
}

interface Layout {
  posizioni: Record<string, PosizionePulsante>;
  opacita: number;
}

const CHIAVE_STORAGE = "senti-layout-pulsanti";
const OPACITA_DEFAULT = 0.85;
const PRESS_LUNGO_MS = 450;

const LAYOUT_DEFAULT: Layout = {
  posizioni: {
    sonoQui: { bordo: "bottom", ordine: 0 },
    campagne: { bordo: "bottom", ordine: 1 },
    eventi: { bordo: "bottom", ordine: 2 },
    battaglie: { bordo: "bottom", ordine: 3 },
    condividi: { bordo: "bottom", ordine: 4 },
    impostazioni: { bordo: "bottom", ordine: 5 },
    trasparenza: { bordo: "bottom", ordine: 6 },
  },
  opacita: OPACITA_DEFAULT,
};

function caricaLayout(): Layout {
  if (typeof window === "undefined") return LAYOUT_DEFAULT;
  try {
    const raw = localStorage.getItem(CHIAVE_STORAGE);
    if (!raw) return LAYOUT_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Layout>;
    return {
      posizioni: { ...LAYOUT_DEFAULT.posizioni, ...parsed.posizioni },
      opacita: typeof parsed.opacita === "number" ? parsed.opacita : OPACITA_DEFAULT,
    };
  } catch {
    return LAYOUT_DEFAULT;
  }
}

function salvaLayout(layout: Layout) {
  try {
    localStorage.setItem(CHIAVE_STORAGE, JSON.stringify(layout));
  } catch {
    /* storage pieno o non disponibile */
  }
}

interface DefPulsante {
  id: string;
  icona: string;
  etichetta?: string;
}

interface Props {
  onSonoQui: () => void;
  onCampagne: () => void;
  onEventi: () => void;
  onBattaglie: () => void;
  onImpostazioni: () => void;
  campagneAttive: number;
  battaglieAttive?: boolean;
  visibile?: boolean;
}

export function BarraPulsanti({
  onSonoQui,
  onCampagne,
  onEventi,
  onBattaglie,
  onImpostazioni,
  campagneAttive,
  battaglieAttive = false,
  visibile = true,
}: Props) {
  const t = useTranslations("mappa");
  const locale = useLocale();
  const [layout, setLayout] = useState<Layout>(LAYOUT_DEFAULT);
  const [sliderAperto, setSliderAperto] = useState(false);
  const [trascinandoVis, setTrascinandoVis] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [bordoTarget, setBordoTarget] = useState<Bordo | null>(null);

  const trascinandoRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const primoRender = useRef(true);

  useEffect(() => {
    setLayout(caricaLayout());
  }, []);

  useEffect(() => {
    if (primoRender.current) {
      primoRender.current = false;
      return;
    }
    salvaLayout(layout);
  }, [layout]);

  const condividi = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const url = `${window.location.origin}${base}/${locale}/`;
    const nav = navigator as Navigator & {
      share?: (d: ShareData) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: "Senti", url });
        return;
      } catch {
        /* annullato */
      }
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent("Senti — " + url)}`,
      "_blank",
    );
  }, [locale]);

  const azioni: Record<string, () => void> = {
    sonoQui: onSonoQui,
    campagne: onCampagne,
    eventi: onEventi,
    battaglie: onBattaglie,
    condividi: () => void condividi(),
    impostazioni: onImpostazioni,
    trasparenza: () => setSliderAperto((v) => !v),
  };

  const pulsanti: DefPulsante[] = [
    { id: "sonoQui", icona: "📍", etichetta: t("barra.sonoQui") },
    {
      id: "campagne",
      icona: "🗺️",
      etichetta: campagneAttive > 0
        ? `${t("barra.campagne")} (${campagneAttive})`
        : t("barra.campagne"),
    },
    { id: "eventi", icona: "📜", etichetta: t("barra.eventi") },
    {
      id: "battaglie",
      icona: "⚔️",
      etichetta: battaglieAttive
        ? `${t("barra.battaglie")} ●`
        : t("barra.battaglie"),
    },
    { id: "condividi", icona: "🔗", etichetta: t("barra.condividi") },
    { id: "impostazioni", icona: "⚙️" },
    { id: "trasparenza", icona: "💧" },
  ];

  const perBordo = (bordo: Bordo) =>
    pulsanti
      .filter((p) => (layout.posizioni[p.id]?.bordo ?? "bottom") === bordo)
      .sort(
        (a, b) =>
          (layout.posizioni[a.id]?.ordine ?? 0) -
          (layout.posizioni[b.id]?.ordine ?? 0),
      );

  function bordoVicino(x: number, y: number): Bordo | null {
    const soglia = 80;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (y < soglia + 30) return "top";
    if (y > h - soglia) return "bottom";
    if (x < soglia) return "left";
    if (x > w - soglia) return "right";
    return null;
  }

  function iniziaDrag(id: string, x: number, y: number) {
    startRef.current = { x, y, id };
    timerRef.current = setTimeout(() => {
      trascinandoRef.current = id;
      setTrascinandoVis(id);
      setGhostPos({ x, y });
      try {
        navigator.vibrate?.(30);
      } catch {
        /* */
      }
    }, PRESS_LUNGO_MS);
  }

  function muoviDrag(x: number, y: number) {
    if (!trascinandoRef.current) {
      if (startRef.current && timerRef.current) {
        const dx = x - startRef.current.x;
        const dy = y - startRef.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          startRef.current = null;
        }
      }
      return;
    }
    setGhostPos({ x, y });
    const b = bordoVicino(x, y);
    setBordoTarget(b);
  }

  function fineDrag() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const idDrag = trascinandoRef.current;
    if (idDrag && bordoTarget) {
      setLayout((prev) => {
        const nuove = { ...prev.posizioni };
        const sulBordo = Object.entries(nuove)
          .filter(([id, p]) => p.bordo === bordoTarget && id !== idDrag)
          .map(([, p]) => p.ordine);
        const maxOrdine = sulBordo.length > 0 ? Math.max(...sulBordo) : -1;
        nuove[idDrag] = { bordo: bordoTarget, ordine: maxOrdine + 1 };
        return { ...prev, posizioni: nuove };
      });
    }

    trascinandoRef.current = null;
    setTrascinandoVis(null);
    setGhostPos(null);
    setBordoTarget(null);
    startRef.current = null;
  }

  function onPointerDown(id: string, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    iniziaDrag(id, e.clientX, e.clientY);
  }

  function onPointerMove(e: React.PointerEvent) {
    e.stopPropagation();
    if (trascinandoRef.current) e.preventDefault();
    muoviDrag(e.clientX, e.clientY);
  }

  function onPointerUp(id: string, e: React.PointerEvent) {
    e.stopPropagation();
    if (!trascinandoRef.current && startRef.current?.id === id) {
      azioni[id]?.();
    }
    fineDrag();
  }

  function onPointerCancel() {
    fineDrag();
  }

  function cambiaOpacita(valore: number) {
    setLayout((prev) => ({ ...prev, opacita: valore }));
  }

  const stileOpacita = {
    "--btn-opacita": layout.opacita,
  } as React.CSSProperties;

  const bordi: Bordo[] = ["top", "bottom", "left", "right"];

  if (!visibile) return null;

  return (
    <>
      {bordi.map((bordo) => {
        const btns = perBordo(bordo);
        if (btns.length === 0) return null;
        return (
          <div
            key={bordo}
            className={`${styles.bordo} ${styles[`bordo_${bordo}`]}`}
            style={stileOpacita}
          >
            {btns.map((p) => (
              <button
                key={p.id}
                className={`${styles.pulsante} ${trascinandoVis === p.id ? styles.nascosto : ""}`}
                onPointerDown={(e) => onPointerDown(p.id, e)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(p.id, e)}
                onPointerCancel={onPointerCancel}
                style={{ touchAction: "none" }}
              >
                <span className={styles.iconaBtn}>{p.icona}</span>
                {p.etichetta && (
                  <span className={styles.etichettaBtn}>{p.etichetta}</span>
                )}
              </button>
            ))}
          </div>
        );
      })}

      {/* Zone di rilascio durante il trascinamento */}
      {trascinandoVis && (
        <>
          <div
            className={`${styles.zona} ${styles.zona_top} ${bordoTarget === "top" ? styles.zonaAttiva : ""}`}
          />
          <div
            className={`${styles.zona} ${styles.zona_bottom} ${bordoTarget === "bottom" ? styles.zonaAttiva : ""}`}
          />
          <div
            className={`${styles.zona} ${styles.zona_left} ${bordoTarget === "left" ? styles.zonaAttiva : ""}`}
          />
          <div
            className={`${styles.zona} ${styles.zona_right} ${bordoTarget === "right" ? styles.zonaAttiva : ""}`}
          />
        </>
      )}

      {/* Fantasma: il pulsante che segue il dito durante il trascinamento */}
      {trascinandoVis && ghostPos && (
        <div
          className={styles.ghost}
          style={{ left: ghostPos.x, top: ghostPos.y }}
        >
          {pulsanti.find((p) => p.id === trascinandoVis)?.icona}
        </div>
      )}

      {/* Cursore trasparenza */}
      {sliderAperto && (
        <div className={styles.sliderPopup}>
          <span className={styles.sliderLabel}>
            💧 {t("barra.trasparenza")}
          </span>
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={layout.opacita}
            onChange={(e) => cambiaOpacita(Number(e.target.value))}
            className={styles.slider}
          />
          <button
            className={styles.resetBtn}
            onClick={() => cambiaOpacita(OPACITA_DEFAULT)}
          >
            {t("barra.predefinito")}
          </button>
          <button
            className={styles.chiudiSlider}
            onClick={() => setSliderAperto(false)}
            aria-label={t("info.chiudi")}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
