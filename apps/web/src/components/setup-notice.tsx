import Link from "next/link";

export function SetupNotice() {
  return (
    <section className="narrow-page notice-page">
      
      <h1>Connect your app to start playing.</h1>
      <p>The collection and group screens need Clerk, PostgreSQL, and the API settings. Add the values described in the README, then reload this page.</p>
      <Link href="/" className="button">Back to Tablefolk</Link>
    </section>
  );
}
