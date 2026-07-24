import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { CatturaMemoria } from "@/components/CatturaMemoria";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RaccontaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CatturaMemoria />;
}
