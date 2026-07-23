import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Configurazione Next.js per Senti.
 *
 * Vincolo architetturale: sito statico puro pubblicato su GitHub Pages.
 * - `output: "export"` genera HTML/CSS/JS statici in `out/`, senza server Next.
 * - NESSUNA route API di Next: tutta la logica server sta nelle Supabase Edge Functions.
 * - `images.unoptimized` è obbligatorio con l'export statico (niente ottimizzatore server).
 *
 * basePath: in produzione su GitHub Pages come "project page" il sito vive sotto
 * /<nome-repo>. Si imposta con NEXT_PUBLIC_BASE_PATH al momento del deploy; in
 * locale resta vuoto così `npm run dev` funziona alla radice.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

// Abilita l'internazionalizzazione (next-intl) leggendo la config da src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
