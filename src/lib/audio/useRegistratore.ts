"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type StatoRegistrazione = "inattivo" | "registrazione" | "fermato";

export interface Registrazione {
  blob: Blob;
  mimeType: string;
  durataMs: number;
}

/** Sceglie un formato che il browser sappia davvero registrare.
 *  Safari/iOS non fa webm: lì si ripiega su mp4. */
function formatoSupportato(): string {
  const candidati = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidati.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Registrazione vocale con MediaRecorder.
 *
 * Nessun passaggio di login: il microfono si apre subito, la sessione anonima
 * viene creata in parallelo. Chiedere di registrarsi prima di lasciar parlare
 * un testimone di novant'anni significa perdere la memoria.
 */
export function useRegistratore() {
  const [stato, setStato] = useState<StatoRegistrazione>("inattivo");
  const [durataMs, setDurataMs] = useState(0);
  const [registrazione, setRegistrazione] = useState<Registrazione | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pezziRef = useRef<Blob[]>([]);
  const avvioRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Analizzatore per la forma d'onda: esposto come ref così il canvas può
  // leggerlo a ogni frame senza far ri-renderizzare React.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const pulisci = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => pulisci, [pulisci]);

  const avvia = useCallback(async () => {
    setErrore(null);
    setRegistrazione(null);
    setDurataMs(0);

    const mimeType = formatoSupportato();
    if (!mimeType) {
      setErrore("Questo browser non permette di registrare audio.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setErrore(
        "Non riesco ad accedere al microfono. Controlla i permessi del browser.",
      );
      return;
    }

    streamRef.current = stream;

    // Analizzatore per la forma d'onda.
    try {
      const ctx = new AudioContext();
      const sorgente = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      sorgente.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      // La forma d'onda è un di più: se non parte, si registra lo stesso.
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    pezziRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) pezziRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(pezziRef.current, { type: mimeType });
      setRegistrazione({
        blob,
        mimeType,
        durataMs: Date.now() - avvioRef.current,
      });
      setStato("fermato");
      pulisci();
    };

    recorderRef.current = recorder;
    avvioRef.current = Date.now();
    recorder.start(1000); // un pezzo al secondo: se l'app muore, non si perde tutto
    setStato("registrazione");

    timerRef.current = setInterval(() => {
      setDurataMs(Date.now() - avvioRef.current);
    }, 200);
  }, [pulisci]);

  const ferma = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const annulla = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    pulisci();
    pezziRef.current = [];
    setRegistrazione(null);
    setDurataMs(0);
    setStato("inattivo");
  }, [pulisci]);

  return { stato, durataMs, registrazione, errore, analyserRef, avvia, ferma, annulla };
}

/** Durata in mm:ss, per la lettura a colpo d'occhio. */
export function formattaDurata(ms: number): string {
  const totale = Math.floor(ms / 1000);
  const min = Math.floor(totale / 60);
  const sec = totale % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
