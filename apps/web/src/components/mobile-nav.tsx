"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show } from "@clerk/nextjs";
import { LanguageToggle } from "@/components/language-toggle";

interface MobileNavProps {
  configured: boolean;
  locale: string;
  labels: {
    dashboard: string;
    collection: string;
    groups: string;
    events: string;
    signIn: string;
    getStarted: string;
    openMenu: string;
    closeMenu: string;
    mainNavAria: string;
  };
}

export function MobileNav({ configured, locale, labels }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const navLinks = [
    { href: "/collection", label: labels.collection },
    { href: "/groups", label: labels.groups },
    { href: "/events", label: labels.events },
  ];

  return (
    <div className="mobile-nav-root">
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        aria-label={open ? labels.closeMenu : labels.openMenu}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            className="mobile-nav-backdrop"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-nav-drawer"
            className="mobile-nav-drawer"
            aria-label={labels.mainNavAria}
          >
            <div className="mobile-nav-links">
              {configured && (
                <Show when="signed-in">
                  <Link
                    href="/dashboard"
                    className={`mobile-nav-link${pathname === "/dashboard" ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {labels.dashboard}
                  </Link>
                </Show>
              )}
              {navLinks.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mobile-nav-link${isActive ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mobile-nav-footer">
              <LanguageToggle currentLocale={locale} />
              {configured ? (
                <Show when="signed-out">
                  <Link
                    className="button button-small"
                    href="/sign-in"
                    onClick={() => setOpen(false)}
                  >
                    {labels.signIn}
                  </Link>
                </Show>
              ) : (
                <Link
                  className="button button-small"
                  href="/collection"
                  onClick={() => setOpen(false)}
                >
                  {labels.getStarted}
                </Link>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
