import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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
      <h1 className={styles.title}>{t("app.name")}</h1>
      <p className={styles.subtitle}>{t("app.tagline")}</p>
      <Link className={styles.cta} href="/racconta">
        {t("home.vaiARaccontare")}
      </Link>
    </main>
  );
}
