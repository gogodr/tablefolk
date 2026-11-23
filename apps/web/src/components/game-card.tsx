"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Game, CollectionGame, GroupGame, GameOwner, Member } from "@tablefolk/contracts";
import { gameCoverSrc } from "@/lib/assets";
import { GameDetailModal } from "@/components/game-detail-modal";

export function cleanExpansionName(baseGameName: string, expansionName: string): string {
  const escaped = baseGameName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}[:\\s–—-]+`, "i");
  const cleaned = expansionName.replace(regex, "").trim();
  return cleaned || expansionName;
}

export function playerRange(game: Game | CollectionGame | GroupGame, t?: (key: string, values?: Record<string, string | number>) => string): string {
  if (!game.minPlayers || !game.maxPlayers) {
    return t ? t("unknownPlayers") : "Player count unknown";
  }
  const effectiveMax = "effectiveMaxPlayers" in game && game.effectiveMaxPlayers
    ? game.effectiveMaxPlayers
    : game.maxPlayers;

  const baseRange = game.minPlayers === game.maxPlayers
    ? (t ? t("singlePlayer", { count: game.minPlayers }) : `${game.minPlayers} players`)
    : (t ? t("playerRange", { min: game.minPlayers, max: game.maxPlayers }) : `${game.minPlayers}–${game.maxPlayers} players`);

  if (effectiveMax > game.maxPlayers) {
    const extra = t ? t("withExpansion", { max: effectiveMax }) : `(up to ${effectiveMax}p with expansion)`;
    return `${baseRange} ${extra}`;
  }
  return baseRange;
}

export function weightLabel(weight: number | null, t?: (key: string, values?: Record<string, string | number>) => string): string | null {
  if (weight === null || weight <= 0) return null;
  const formatted = weight.toFixed(1);
  if (t) {
    if (weight <= 2.2) return t("light", { weight: formatted });
    if (weight <= 3.5) return t("medium", { weight: formatted });
    return t("heavy", { weight: formatted });
  }
  if (weight <= 2.2) return `Light (${formatted})`;
  if (weight <= 3.5) return `Medium (${formatted})`;
  return `Heavy (${formatted})`;
}

interface GameCardProps {
  game: Game | CollectionGame | GroupGame;
  eagerCover?: boolean;
  owners?: (GameOwner | Member)[];
  actions?: React.ReactNode;
  interestScore?: number;
  onVote?: () => void;
  canVote?: boolean;
}

export function GameCard({ game, eagerCover = false, owners, actions, interestScore, onVote, canVote }: GameCardProps) {
  const t = useTranslations("gameCard");
  const tCollection = useTranslations("collection");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const complexity = weightLabel(game.weight, (key, values) => t(key as any, values));
  const versionName = "versionName" in game ? (game as CollectionGame).versionName : null;
  const isAvailable = "isAvailable" in game ? (game as CollectionGame).isAvailable : true;
  const unavailableReason = "unavailableReason" in game ? (game as CollectionGame).unavailableReason : null;
  const expansions = "expansions" in game ? game.expansions : undefined;

  function formatReason(raw: string | null | undefined): string | null {
    if (!raw) return null;
    switch (raw) {
      case "In storage":
      case "Guardado en almacén":
        return tCollection("inStorage");
      case "Lent out":
      case "Prestado a un amigo":
        return tCollection("lentOut");
      case "Too heavy to transport":
      case "Demasiado pesado para transportar":
        return tCollection("tooHeavy");
      case "Home only":
      case "Solo en casa (jugar en mi casa)":
        return tCollection("homeOnlyReason");
      case "Missing pieces":
      case "Piezas faltantes / en reparación":
        return tCollection("missingPieces");
      case "Not ready to play":
      case "No listo para jugar / sin destroquelar":
        return tCollection("notReadyToPlay");
      case "At another location / in transit":
      case "En otra casa / en tránsito":
        return tCollection("inTransit");
      case "Needs sleeving / organizing":
      case "Pendiente de enfundar u organizar":
        return tCollection("needsOrganizing");
      default:
        return raw;
    }
  }

  const displayedReason = formatReason(unavailableReason) || t("homeOnly");

  return (
    <>
      <article
        className="game-card game-card-clickable"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label")) {
            return;
          }
          setIsDetailsOpen(true);
        }}
        title="Click to view full game details, mechanics & synopsis"
      >
        <div className="game-cover">
          {game.coverUrl ? (
            <img
              src={gameCoverSrc(game.coverUrl)}
              alt={`${game.name} cover`}
              loading={eagerCover ? "eager" : "lazy"}
              fetchPriority={eagerCover ? "high" : undefined}
              onError={(e) => {
                e.currentTarget.src = "/brand/tablefolk-mark.png";
                e.currentTarget.className = "cover-placeholder";
              }}
            />
          ) : (
            <img className="cover-placeholder" src="/brand/tablefolk-mark.png" alt="" />
          )}
        </div>
        <div className="game-card-body">
          <div className="game-card-heading">
            <h3>{game.name}</h3>
            {game.kind === "boardgameexpansion" && (
              <span className={`game-kind ${"isStandalone" in game && game.isStandalone ? "game-kind-standalone" : ""}`}>
                {"isStandalone" in game && game.isStandalone ? t("standalone") : t("expansion")}
              </span>
            )}
            <button
              type="button"
              className="game-info-trigger"
              onClick={() => setIsDetailsOpen(true)}
              title={t("viewDetailsTitle")}
              aria-label={t("viewDetailsAria")}
            >
              ℹ️
            </button>
          </div>
        <p className="game-meta">
          <span className="meta-pill meta-players">{playerRange(game, (key, values) => t(key as any, values))}</span>
          {game.bestPlayers && (
            <span className="meta-pill meta-best-players" title={t("bestWithPlayers", { count: game.bestPlayers })}>
              ⭐ {t("bestAtBadge", { count: game.bestPlayers })}
            </span>
          )}
          {game.rating && (
            <span className="meta-pill meta-rating" title={t("bggRatingTooltip", { rating: game.rating.toFixed(1) })}>
              ★ {game.rating.toFixed(1)}
            </span>
          )}
          {game.rank && (
            <span className="meta-pill meta-rank" title={t("bggRankTooltip", { rank: game.rank })}>
              🏆 #{game.rank}
            </span>
          )}
          {game.playingTime && <span className="meta-pill meta-time">{game.playingTime} min</span>}
          {complexity && (
            <span
              className={`meta-pill meta-weight ${
                (game.weight ?? 0) > 3.2
                  ? "weight-heavy"
                  : (game.weight ?? 0) > 2.2
                  ? "weight-medium"
                  : "weight-light"
              }`}
            >
              {complexity}
            </span>
          )}
          {game.yearPublished && <span className="meta-pill meta-year">{game.yearPublished}</span>}
          {versionName && <span className="meta-pill meta-version" title={`Edition: ${versionName}`}>{versionName}</span>}
          {game.baseGameTitle && <span className="meta-pill meta-basegame" title={`Expansion for ${game.baseGameTitle}`}>{t("forBaseGame", { title: game.baseGameTitle })}</span>}
          {!isAvailable && <span className="meta-pill meta-unavailable" title={displayedReason}>{displayedReason}</span>}
        </p>

        {interestScore !== undefined && interestScore > 0 && (
          <div className="game-interest-badge">
            <span>{t("wantPoint", { count: interestScore })}</span>
            {canVote && onVote && (
              <button type="button" className="button-quiet button-small" onClick={onVote}>
                {t("addVote")}
              </button>
            )}
          </div>
        )}

        {expansions && expansions.length > 0 && (
          <div className="game-attached-expansions-box">
            <span className="attached-expansions-label">
              📦 <strong>{t("includedExpansions", { count: expansions.length })}</strong>{" "}
              {expansions.slice(0, 3).map((exp, i) => (
                <span key={exp.bggId} className="attached-expansion-chip">
                  {i > 0 && ", "}
                  {cleanExpansionName(game.name, exp.name)}
                  {exp.maxPlayers && exp.maxPlayers > (game.maxPlayers ?? 0) && (
                    <span className="expansion-chip-bump"> (up to {exp.maxPlayers}p)</span>
                  )}
                </span>
              ))}
              {expansions.length > 3 && (
                <span className="attached-expansions-more-tag" title="Click card to view all expansions in details">
                  {" "}…+{expansions.length - 3} more
                </span>
              )}
            </span>
          </div>
        )}

        {owners && owners.length > 0 && (
          <div className="game-owners">
            <strong>{t("sharedBy")}</strong>{" "}
            {owners.map((owner, idx) => {
              const gameOwner = owner as GameOwner;
              return (
                <span key={owner.userId}>
                  {idx > 0 && ", "}
                  {owner.displayName}
                  {gameOwner.versionName && ` (${gameOwner.versionName})`}
                  {gameOwner.isAvailable === false && (
                    <span className="owner-unavailable">
                      {" "}[{formatReason(gameOwner.unavailableReason) || t("unavailable")}]
                    </span>
                  )}
                  {owner.bggUsername && (
                    <a
                      href={`https://boardgamegeek.com/user/${owner.bggUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bgg-user-link"
                      title="BGG Profile"
                    >
                      {" "}↗ BGG
                    </a>
                  )}
                </span>
              );
            })}
          </div>
        )}

        <div className="game-card-bottom">
          <a href={game.sourceUrl} target="_blank" rel="noreferrer" className="text-link">
            {t("viewOnBgg")}
          </a>
          {actions}
        </div>
      </div>
    </article>

    <GameDetailModal
      game={game}
      owners={owners}
      isOpen={isDetailsOpen}
      onClose={() => setIsDetailsOpen(false)}
    />
  </>
  );
}
