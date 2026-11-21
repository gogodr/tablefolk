import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { QueryProvider } from "@/components/query-provider";
import { LanguageToggle } from "@/components/language-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tablefolk · Pick a game together",
  description: "Bring your board game collections together and find the right game for game night.",
  icons: { icon: "/brand/tablefolk-mark.png" },
};

async function Header({ configured, locale }: { configured: boolean; locale: string }) {
  const tNav = await getTranslations("navigation");

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" href="/" aria-label={tNav("tablefolkHomeAria")}>
          <img src="/brand/tablefolk-mark.png" alt="" width="48" height="48" />
          <span>tablefolk</span>
        </Link>
        <nav aria-label={tNav("mainNavAria")} className="main-nav">
          {configured && (
            <Show when="signed-in">
              <Link href="/dashboard">{tNav("dashboard")}</Link>
            </Show>
          )}
          <Link href="/collection">{tNav("collection")}</Link>
          <Link href="/groups">{tNav("groups")}</Link>
          <Link href="/events">{tNav("events")}</Link>
        </nav>
        <div className="header-account">
          <LanguageToggle currentLocale={locale} />
          {configured ? (
            <>
              <Suspense>
                <Show when="signed-out"><Link className="button button-small" href="/sign-in">{tNav("signIn")}</Link></Show>
                <Show when="signed-in"><UserButton /></Show>
              </Suspense>
            </>
          ) : <Link className="button button-small" href="/collection">{tNav("getStarted")}</Link>}
        </div>
      </div>
    </header>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const locale = await getLocale();
  const messages = await getMessages();
  const tCommon = await getTranslations("common");

  const content = (
    <>
      <Header configured={Boolean(key)} locale={locale} />
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <span>{tCommon("footerTagline")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <LanguageToggle currentLocale={locale} />
          <a className="bgg-credit" href="https://boardgamegeek.com" target="_blank" rel="noreferrer">
            <img src="/vendor/powered_by_bgg.webp" alt={tCommon("poweredByBgg")} width="200" height="59" />
          </a>
        </div>
      </footer>
    </>
  );
  return (
    <html lang={locale}>
      <body>
        <QueryProvider>
          <NextIntlClientProvider messages={messages} locale={locale}>
            {key ? <ClerkProvider publishableKey={key}>{content}</ClerkProvider> : content}
          </NextIntlClientProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
