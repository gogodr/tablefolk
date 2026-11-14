import type { Game, CollectionGame, GroupGame, GameOwner, Member } from "@tablefolk/contracts";
import { gameCoverSrc } from "@/lib/assets";

export function cleanExpansionName(baseGameName: string, expansionName: string): string {
  const escaped = baseGameName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}[:\\s–—-]+`, "i");
  const cleaned = expansionName.replace(regex, "").trim();
  return cleaned || expansionName;
}

export function playerRange(game: Game | CollectionGame | GroupGame): string {
  if (!game.minPlayers || !game.maxPlayers) return "Player count unknown";
  const effectiveMax = "effectiveMaxPlayers" in game && game.effectiveMaxPlayers
    ? game.effectiveMaxPlayers
    : game.maxPlayers;

  const baseRange = game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} players`
    : `${game.minPlayers}–${game.maxPlayers} players`;

  if (effectiveMax > game.maxPlayers) {
    return `${baseRange} (up to ${effectiveMax}p with expansion)`;
  }
  return baseRange;
}

export function weightLabel(weight: number | null): string | null {
  if (weight === null || weight <= 0) return null;
  if (weight <= 2.2) return `Light (${weight.toFixed(1)})`;
  if (weight <= 3.5) return `Medium (${weight.toFixed(1)})`;
  return `Heavy (${weight.toFixed(1)})`;
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
  const complexity = weightLabel(game.weight);
  const versionName = "versionName" in game ? (game as CollectionGame).versionName : null;
  const isAvailable = "isAvailable" in game ? (game as CollectionGame).isAvailable : true;
  const unavailableReason = "unavailableReason" in game ? (game as CollectionGame).unavailableReason : null;
  const expansions = "expansions" in game ? game.expansions : undefined;

  return (
    <article className="game-card">
      <div className="game-cover">
        {game.coverUrl ? (
          <img src={gameCoverSrc(game.coverUrl)} alt={`${game.name} cover`} loading={eagerCover ? "eager" : "lazy"} fetchPriority={eagerCover ? "high" : undefined} />
        ) : (
          <img className="cover-placeholder" src="/brand/tablefolk-mark.png" alt="" />
        )}
      </div>
      <div className="game-card-body">
        <div className="game-card-heading">
          <h3>
            {game.name}
            {expansions && expansions.length > 0 && (
              <span className="game-attached-expansions-tag" title={expansions.map((e) => e.name).join(", ")}>
                {" + "}{expansions.map((e) => cleanExpansionName(game.name, e.name)).join(", ")}
              </span>
            )}
          </h3>
          {game.kind === "boardgameexpansion" && <span className="game-kind">Expansion</span>}
        </div>
        <p className="game-meta">
          <span className="meta-pill meta-players">{playerRange(game)}</span>
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
          {game.baseGameTitle && <span className="meta-pill meta-basegame" title={`Expansion for ${game.baseGameTitle}`}>For {game.baseGameTitle}</span>}
          {expansions && expansions.length > 0 && (
            <span
              className="meta-pill meta-expansions-badge"
              title={expansions.map((expansion) => `${expansion.name} (up to ${expansion.maxPlayers ?? "?"} players)`).join(", ")}
            >
              📦 {expansions.length === 1 && expansions[0] ? `+ ${cleanExpansionName(game.name, expansions[0].name)}` : `+ ${expansions.length} expansions`}
            </span>
          )}
          {!isAvailable && <span className="meta-pill meta-unavailable" title={unavailableReason || "Unavailable to travel"}>{unavailableReason || "Home only"}</span>}
        </p>

        {interestScore !== undefined && interestScore > 0 && (
          <div className="game-interest-badge">
            <span>{interestScore} {interestScore === 1 ? "want point" : "want points"}</span>
            {canVote && onVote && (
              <button type="button" className="button-quiet button-small" onClick={onVote}>
                + Add vote
              </button>
            )}
          </div>
        )}

        {owners && owners.length > 0 && (
          <div className="game-owners">
            <strong>Shared by:</strong>{" "}
            {owners.map((owner, idx) => {
              const gameOwner = owner as GameOwner;
              return (
                <span key={owner.userId}>
                  {idx > 0 && ", "}
                  {owner.displayName}
                  {gameOwner.versionName && ` (${gameOwner.versionName})`}
                  {gameOwner.isAvailable === false && (
                    <span className="owner-unavailable">
                      {" "}[{gameOwner.unavailableReason || "Unavailable"}]
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
            View on BGG
          </a>
          {actions}
        </div>
      </div>
    </article>
  );
}
