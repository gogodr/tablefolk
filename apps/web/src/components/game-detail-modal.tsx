"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Game, CollectionGame, GroupGame, GameOwner, Member } from "@tablefolk/contracts";
import { gameCoverSrc } from "@/lib/assets";
import { playerRange, weightLabel, cleanExpansionName } from "@/components/game-card";

function decodeBggText(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Decode common HTML entities from BGG
  const decoded = raw
    .replace(/&#10;/g, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/<br\s*\/?>/gi, "\n");

  return decoded
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

interface GameDetailModalProps {
  game: Game | CollectionGame | GroupGame;
  owners?: (GameOwner | Member)[];
  isOpen: boolean;
  onClose: () => void;
}

export function GameDetailModal({ game, owners, isOpen, onClose }: GameDetailModalProps) {
  const t = useTranslations("gameDetail");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const complexity = weightLabel(game.weight);
  const expansions = "expansions" in game ? game.expansions : undefined;
  const descriptionParagraphs = decodeBggText(game.description);
  const mechanics = game.mechanics ?? [];
  const categories = game.categories ?? [];

  return (
    <dialog
      ref={dialogRef}
      className="game-detail-dialog"
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="game-detail-container">
        {/* Header with Close Button */}
        <div className="game-detail-header">
          <div className="game-detail-title-wrap">
            <h2>{game.name}</h2>
            {game.yearPublished && (
              <span className="game-detail-year">({game.yearPublished})</span>
            )}
            {game.kind === "boardgameexpansion" && (
              <span className="game-kind">
                {"isStandalone" in game && game.isStandalone ? t("standaloneExpansion") : t("expansion")}
              </span>
            )}
          </div>
          <button
            type="button"
            className="game-detail-close"
            onClick={onClose}
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>

        <div className="game-detail-body">
          {/* Left Column: Media & Core Stats */}
          <div className="game-detail-media-col">
            <div className="game-detail-cover">
              {game.coverUrl ? (
                <img
                  src={gameCoverSrc(game.coverUrl)}
                  alt={`${game.name} cover`}
                  onError={(e) => {
                    e.currentTarget.src = "/brand/tablefolk-mark.png";
                    e.currentTarget.className = "cover-placeholder";
                  }}
                />
              ) : (
                <img className="cover-placeholder" src="/brand/tablefolk-mark.png" alt="" />
              )}
            </div>

            <div className="game-detail-stats-grid">
              <div className="detail-stat">
                <span className="detail-stat-label">👥 Players</span>
                <strong className="detail-stat-value">{playerRange(game)}</strong>
              </div>
              {game.playingTime && (
                <div className="detail-stat">
                  <span className="detail-stat-label">⏱️ Duration</span>
                  <strong className="detail-stat-value">{game.playingTime} min</strong>
                </div>
              )}
              {complexity && (
                <div className="detail-stat">
                  <span className="detail-stat-label">⚖️ BGG Weight</span>
                  <strong
                    className={`detail-stat-value ${
                      (game.weight ?? 0) > 3.2
                        ? "weight-heavy"
                        : (game.weight ?? 0) > 2.2
                        ? "weight-medium"
                        : "weight-light"
                    }`}
                  >
                    {complexity}
                  </strong>
                </div>
              )}
              {game.minAge && (
                <div className="detail-stat">
                  <span className="detail-stat-label">🎂 Min age</span>
                  <strong className="detail-stat-value">{game.minAge}+</strong>
                </div>
              )}
            </div>

            {owners && owners.length > 0 && (
              <div className="game-detail-owners">
                <span className="detail-stat-label">🏠 Owned by:</span>
                <p>
                  {owners.map((owner, idx) => (
                    <span key={owner.userId}>
                      {idx > 0 && ", "}
                      <strong>{owner.displayName}</strong>
                    </span>
                  ))}
                </p>
              </div>
            )}

            <div className="game-detail-bgg-action">
              <a
                href={game.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="button-secondary button-small"
              >
                ↗ View on BoardGameGeek
              </a>
            </div>
          </div>

          {/* Right Column: Tags & Description */}
          <div className="game-detail-info-col">
            {/* Mechanics Tags */}
            <div className="detail-section">
              <h3 className="detail-section-title">
                🎲 BGG Mechanics {mechanics.length > 0 && `(${mechanics.length})`}
              </h3>
              {mechanics.length > 0 ? (
                <div className="detail-chips-wrap">
                  {mechanics.map((m) => (
                    <span key={m} className="detail-chip detail-chip-mechanic">
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="detail-empty-text">{t("noMechanics")}</p>
              )}
            </div>

            {/* Categories Tags */}
            <div className="detail-section">
              <h3 className="detail-section-title">
                {t("categoriesThemes")} {categories.length > 0 && `(${categories.length})`}
              </h3>
              {categories.length > 0 ? (
                <div className="detail-chips-wrap">
                  {categories.map((c) => (
                    <span key={c} className="detail-chip detail-chip-category">
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="detail-empty-text">{t("noCategories")}</p>
              )}
            </div>

            {/* Included Expansions Showcase */}
            {expansions && expansions.length > 0 && (
              <div className="detail-section detail-expansions-section">
                <div className="detail-expansions-header">
                  <h3 className="detail-section-title">
                    {t("includedExpansions", { count: expansions.length })}
                  </h3>
                  <span className="detail-expansions-summary-badge">
                    {expansions.some((e) => e.maxPlayers && e.maxPlayers > (game.maxPlayers ?? 0))
                      ? t("expandsToPlayers", { count: Math.max(...expansions.map((e) => e.maxPlayers ?? 0)) })
                      : t("expandsContent")}
                  </span>
                </div>
                <div className="detail-expansions-grid">
                  {expansions.map((exp) => {
                    const cleaned = cleanExpansionName(game.name, exp.name);
                    const bumps = exp.maxPlayers && exp.maxPlayers > (game.maxPlayers ?? 0);
                    return (
                      <div key={exp.bggId} className="detail-expansion-item">
                        <div className="detail-expansion-item-left">
                          <span className="detail-expansion-box-icon">📦</span>
                          <div>
                            <strong className="detail-expansion-item-name">{cleaned}</strong>
                            {bumps && (
                              <span className="detail-expansion-bump-pill">
                                {t("upToPlayers", { max: exp.maxPlayers ?? 0, bump: (exp.maxPlayers ?? 0) - (game.maxPlayers ?? 0) })}
                              </span>
                            )}
                          </div>
                        </div>
                        <a
                          href={`https://boardgamegeek.com/boardgameexpansion/${exp.bggId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="button-quiet button-small detail-expansion-bgg"
                          title={t("viewOnBgg")}
                        >
                          ↗ BGG
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Synopsis / Description */}
            <div className="detail-section">
              <h3 className="detail-section-title">{t("description")}</h3>
              {descriptionParagraphs.length > 0 ? (
                <div className="detail-description">
                  {descriptionParagraphs.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              ) : (
                <p className="detail-empty-text">{t("noSynopsis")}</p>
              )}
            </div>

            {/* Designers & Publishers */}
            {(game.designers.length > 0 || game.publishers.length > 0) && (
              <div className="detail-section detail-credits">
                {game.designers.length > 0 && (
                  <p>
                    <strong>{t("design")}</strong> {game.designers.join(", ")}
                  </p>
                )}
                {game.publishers.length > 0 && (
                  <p>
                    <strong>{t("publisher")}</strong> {game.publishers.slice(0, 4).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
