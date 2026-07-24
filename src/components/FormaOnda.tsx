"use client";

import { useEffect, useRef, type RefObject } from "react";

interface Props {
  analyserRef: RefObject<AnalyserNode | null>;
  attiva: boolean;
}

/**
 * Forma d'onda dal vivo durante la registrazione.
 *
 * Serve a una cosa concreta: far vedere a chi registra che il microfono sta
 * davvero prendendo la voce. Senza, si scopre a fine racconto che non aveva
 * registrato nulla — e una testimonianza non si ripete due volte uguale.
 *
 * Disegna su canvas dentro requestAnimationFrame: nessun re-render di React,
 * nessun costo per il resto della pagina.
 */
export function FormaOnda({ analyserRef, attiva }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number>(0);
  const livelliRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Nitidezza sugli schermi ad alta densità dei telefoni.
    const dpr = window.devicePixelRatio || 1;
    const ridimensiona = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    ridimensiona();
    window.addEventListener("resize", ridimensiona);

    const buffer = new Uint8Array(1024);

    const disegna = () => {
      frameRef.current = requestAnimationFrame(disegna);

      const l = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, l, h);

      const analyser = analyserRef.current;
      if (attiva && analyser) {
        analyser.getByteTimeDomainData(buffer);
        // Ampiezza massima di questo frame, 0..1
        let picco = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = Math.abs(buffer[i] - 128) / 128;
          if (v > picco) picco = v;
        }
        livelliRef.current.push(picco);
      } else if (attiva) {
        livelliRef.current.push(0);
      }

      const larghezzaBarra = 3 * dpr;
      const spazio = 2 * dpr;
      const passo = larghezzaBarra + spazio;
      const maxBarre = Math.floor(l / passo);
      if (livelliRef.current.length > maxBarre) {
        livelliRef.current = livelliRef.current.slice(-maxBarre);
      }

      const stile = getComputedStyle(canvas);
      ctx.fillStyle = stile.getPropertyValue("color") || "#2f2415";

      livelliRef.current.forEach((livello, i) => {
        // Un minimo di altezza sempre visibile: la linea non deve sparire.
        const altezza = Math.max(2 * dpr, livello * h * 0.9);
        const x = i * passo;
        const y = (h - altezza) / 2;
        ctx.fillRect(x, y, larghezzaBarra, altezza);
      });
    };

    disegna();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", ridimensiona);
    };
  }, [analyserRef, attiva]);

  useEffect(() => {
    if (!attiva) livelliRef.current = [];
  }, [attiva]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: "100%", height: "4.5rem", display: "block" }}
    />
  );
}
