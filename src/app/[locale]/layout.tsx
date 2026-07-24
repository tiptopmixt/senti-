import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SelettoreDemo } from "@/components/SelettoreDemo";
import "../globals.css";

export const metadata: Metadata = {
  title: "Senti",
  description:
    "Una mappa di percorsi e sentieri arricchiti dalla memoria delle persone.",
};

// Mobile-first: la viewport è pensata per lo smartphone come dispositivo primario.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2b2016",
};

// Genera staticamente una variante del sito per ogni lingua (export statico).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Abilita il rendering statico dei componenti server localizzati.
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          {children}
          <SelettoreDemo />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
