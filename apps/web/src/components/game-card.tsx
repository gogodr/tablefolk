import type { Game, GameOwner, Member } from "@tablefolk/contracts";
import { gameCoverSrc } from "@/lib/assets";

export function playerRange(game: Game): string {
  if (!game.minPlayers || !game.maxPlayers) return "Player count unknown";
  return game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} players`
    : `${game.minPlayers}–${game.maxPlayers} players`;
}

export function weightLabel(weight: number | null): string | null {
  if (weight === null || weight <= 0) return null;
  if (weight <= 2.2) return `Light (${weight.toFixed(1)})`;
  if (weight <= 3.5) return `Medium (${weight.toFixed(1)})`;
  return `Heavy (${weight.toFixed(1)})`;
}

interface GameCardProps {
  game: Game;
  owners?: (GameOwner | Member)[];
  actions?: React.ReactNode;
  interestScore?: number;
  onVote?: () => void;
  canVote?: boolean;
}

export function GameCard({ game, owners, actions, interestScore, onVote, canVote }: GameCardProps) {
  const complexity = weightLabel(game.weight);

  return (
    <article className="game-card">
      <div className="game-cover">
        {game.coverUrl ? (
          <img src={gameCoverSrc(game.coverUrl)} alt={`${game.name} cover`} loading="lazy" />
        ) : (
          <img className="cover-placeholder" src="/brand/tablefolk-mark.png" alt="" />
        )}
      </div>
      <div className="game-card-body">
        <div className="game-card-heading">
          <h3>{game.name}</h3>
          {game.kind === "boardgameexpansion" && <span className="game-kind">Expansion</span>}
        </div>
        <p className="game-meta">
          <span className="meta-pill meta-players">{playerRange(game)}</span>
          {game.playingTime && <span className="meta-pill meta-time">⏱️ {game.playingTime} min</span>}
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
              ⚖️ {complexity}
            </span>
          )}
          {game.yearPublished && <span className="meta-pill meta-year">📅 {game.yearPublished}</span>}
        </p>

        {interestScore !== undefined && interestScore > 0 && (
          <div className="game-interest-badge">
            <span>⭐ {interestScore} {interestScore === 1 ? "want point" : "want points"}</span>
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
