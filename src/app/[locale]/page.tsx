import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Condividi } from "@/components/Condividi";
import styles from "./page.module.css";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className={styles.main}>
      <div className={styles.barra}>
        <Condividi titolo={t("app.name")} />
      </div>
      <h1 className={styles.title}>{t("app.name")}</h1>
      <p className={styles.subtitle}>{t("app.tagline")}</p>
      <Link className={styles.cta} href="/mappa">
        {t("home.vaiAllaMappa")}
      </Link>
      <Link className={styles.ctaSecondaria} href="/racconta">
        {t("home.vaiARaccontare")}
      </Link>
      <Link className={styles.link} href="/io">
        {t("home.vaiAllIo")}
      </Link>
    </main>
  );
}
