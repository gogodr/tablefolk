import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <div className="home-page">
      <Show when="signed-in">
        <aside className="home-signedin-banner" aria-label={t("bannerAria")}>
          <div className="home-signedin-content">
            <span className="home-signedin-icon" aria-hidden="true">🎲</span>
            <span>{t("bannerText")}</span>
          </div>
          <Link href="/dashboard" className="button button-small">
            {t("goToDashboard")}
          </Link>
        </aside>
      </Show>
      <section className="hero">
        <div>
          <h1>{t("heroTitle")}</h1>
          <p>{t("heroSubtitle")}</p>
          <div className="hero-buttons">
            <Link className="button" href="/collection">{t("startCollection")}</Link>
            <Link className="button-secondary" href="/groups">{t("seeGroups")}</Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img src="/illustrations/tabletop-hero.png" alt="" />
        </div>
      </section>
      <section className="home-strip" aria-label={t("stripAria")}>
        <article><strong>{t("step1Title")}</strong><span>{t("step1Text")}</span></article>
        <article><strong>{t("step2Title")}</strong><span>{t("step2Text")}</span></article>
        <article><strong>{t("step3Title")}</strong><span>{t("step3Text")}</span></article>
      </section>
      <section className="home-preview">
        <div>
          <h2>{t("previewTitle")}</h2>
          <p>{t("previewSubtitle")}</p>
          <Link href="/groups" className="text-link">{t("previewLink")}</Link>
        </div>
        <div className="preview-board" aria-label={t("previewBoardAria")}>
          <div className="preview-top"><strong>{t("previewTopTitle")}</strong><span className="muted">{t("previewTopSubtitle")}</span></div>
          <div className="preview-rows">
            <div className="preview-row"><span>{t("row1Label")}</span><span>{t("row1Value")}</span></div>
            <div className="preview-row"><span>{t("row2Label")}</span><span>{t("row2Value")}</span></div>
            <div className="preview-row"><span>{t("row3Label")}</span><span>{t("row3Value")}</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
