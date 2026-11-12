import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tablefolk · Pick a game together",
  description: "Bring your board game collections together and find the right game for game night.",
  icons: { icon: "/brand/tablefolk-mark.png" },
};

function Header({ configured }: { configured: boolean }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" href="/" aria-label="Tablefolk home">
          <img src="/brand/tablefolk-mark.png" alt="" width="48" height="48" />
          <span>tablefolk</span>
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/collection">My collection</Link>
          <Link href="/groups">Groups</Link>
        </nav>
        <div className="header-account">
          {configured ? (
            <>
              <Suspense>
                <Show when="signed-out"><Link className="button button-small" href="/sign-in">Sign in</Link></Show>
                <Show when="signed-in"><UserButton /></Show>
              </Suspense>
            </>
          ) : <Link className="button button-small" href="/collection">Get started</Link>}
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = (
    <>
      <Header configured={Boolean(key)} />
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <span>Made for the games you bring to the table.</span>
        <a className="bgg-credit" href="https://boardgamegeek.com" target="_blank" rel="noreferrer">
          <img src="/vendor/powered_by_bgg.webp" alt="Powered by BoardGameGeek" width="200" height="59" />
        </a>
      </footer>
    </>
  );
  return (
    <html lang="en">
      <body>{key ? <ClerkProvider publishableKey={key}>{content}</ClerkProvider> : content}</body>
    </html>
  );
}
