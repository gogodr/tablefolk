import Link from "next/link";

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="hero">
        <div>
          <h1>Good games are better together.</h1>
          <p>Bring everyone&apos;s games together and draw one that fits your table.</p>
          <div className="hero-buttons">
            <Link className="button" href="/collection">Start your collection</Link>
            <Link className="button-secondary" href="/groups">See your groups</Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img src="/illustrations/tabletop-hero.png" alt="" />
        </div>
      </section>
      <section className="home-strip" aria-label="How Tablefolk works">
        <article><strong>Collect your favorites</strong><span>Find a game through BoardGameGeek once. Its details live in your collection from then on.</span></article>
        <article><strong>Bring the group together</strong><span>Invite friends by email and share only the games you want the group to see.</span></article>
        <article><strong>Draw the next game</strong><span>Enter your player count and get a random pick from games your group shares.</span></article>
      </section>
      <section className="home-preview">
        <div>
          <h2>One table. Everyone&apos;s games.</h2>
          <p>Each game appears once in a group, with the people who shared it right there. A game stays in the group even if one of several owners stops sharing.</p>
          <Link href="/groups" className="text-link">Go to your groups</Link>
        </div>
        <div className="preview-board" aria-label="How a shared collection works">
          <div className="preview-top"><strong>Your group collection</strong><span className="muted">Ready for game night</span></div>
          <div className="preview-rows">
            <div className="preview-row"><span>Games brought together</span><span>One entry per title</span></div>
            <div className="preview-row"><span>Sharing members</span><span>Shown beside each game</span></div>
            <div className="preview-row"><span>Game night draw</span><span>Filtered by players</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
