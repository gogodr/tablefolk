"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export function SetupNotice() {
  const t = useTranslations("setupNotice");

  return (
    <section className="narrow-page notice-page">
      <h1>{t("title")}</h1>
      <p>{t("description")}</p>
      <Link href="/" className="button">{t("backHome")}</Link>
    </section>
  );
}
