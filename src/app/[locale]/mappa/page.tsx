import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Mappa } from "@/components/Mappa";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function MappaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Mappa />;
}
