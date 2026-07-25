import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Impostazioni } from "@/components/Impostazioni";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Pagina({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Impostazioni />;
}
