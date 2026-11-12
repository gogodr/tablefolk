import type { Game, Member } from "@tablefolk/contracts";
import { gameCoverSrc } from "@/lib/assets";

export function playerRange(game: Game): string {
  if (!game.minPlayers || !game.maxPlayers) return "Player count unknown";
  return game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} players`
    : `${game.minPlayers}–${game.maxPlayers} players`;
}

export function GameCard({ game, owners, actions }: { game: Game; owners?: Member[]; actions?: React.ReactNode }) {
  return (
    <article className="game-card">
      <div className="game-cover">
        {game.coverUrl ? <img src={gameCoverSrc(game.coverUrl)} alt={`${game.name} cover`} loading="lazy" /> : <img className="cover-placeholder" src="/brand/tablefolk-mark.png" alt="" />}
      </div>
      <div className="game-card-body">
        <div className="game-card-heading">
          <h3>{game.name}</h3>
          {game.kind === "boardgameexpansion" && <span className="game-kind">Expansion</span>}
        </div>
        <p className="game-meta">{playerRange(game)}{game.playingTime ? ` · ${game.playingTime} min` : ""}{game.yearPublished ? ` · ${game.yearPublished}` : ""}</p>
        {owners && <p className="game-owners"><strong>Shared by</strong> {owners.map((owner) => owner.displayName).join(", ")}</p>}
        <div className="game-card-bottom">
          <a href={game.sourceUrl} target="_blank" rel="noreferrer" className="text-link">View on BGG</a>
          {actions}
        </div>
      </div>
    </article>
  );
}
