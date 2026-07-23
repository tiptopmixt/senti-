import { defineRouting } from "next-intl/routing";

/**
 * Configurazione delle lingue dell'interfaccia.
 * Italiano è la lingua di default; l'inglese è la seconda lingua.
 * Con l'export statico gli URL sono sempre prefissati: /it/... e /en/...
 */
export const routing = defineRouting({
  locales: ["it", "en"],
  defaultLocale: "it",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
