"use client";

import { useTransition } from "react";

export function LanguageToggle({ currentLocale }: { currentLocale?: string }) {
  const [isPending, startTransition] = useTransition();

  function switchLocale(nextLocale: "es" | "en") {
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      window.location.reload();
    });
  }

  const isSpanish = (currentLocale || "es") === "es";

  return (
    <div className="language-toggle" role="group" aria-label="Language selector">
      <button
        type="button"
        className={`lang-btn ${isSpanish ? "active" : ""}`}
        onClick={() => switchLocale("es")}
        disabled={isPending || isSpanish}
        aria-pressed={isSpanish}
        title="Cambiar a Español"
      >
        ES
      </button>
      <span className="lang-sep" aria-hidden="true">
        /
      </span>
      <button
        type="button"
        className={`lang-btn ${!isSpanish ? "active" : ""}`}
        onClick={() => switchLocale("en")}
        disabled={isPending || !isSpanish}
        aria-pressed={!isSpanish}
        title="Switch to English"
      >
        EN
      </button>
    </div>
  );
}
