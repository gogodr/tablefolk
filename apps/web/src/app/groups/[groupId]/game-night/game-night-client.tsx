"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { DrawPanel } from "@/components/draw-panel";
import { useGroupDetailQuery } from "@/lib/queries";

export function GameNightClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const { data, isLoading, error: queryError, refetch } = useGroupDetailQuery(groupId);
  const group = data?.group ?? null;

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="page">
        <p className="loading">Preparing game night…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Sign in to pick a game.</h1>
        <Link className="button" href="/sign-in">Sign in</Link>
      </section>
    );
  }

  if (queryError || (!isLoading && !group)) {
    return (
      <section className="narrow-page">
        <div className="state-message error">
          <p>{(queryError instanceof Error ? queryError.message : "") || "Group not found."}</p>
          <button className="button-quiet" onClick={() => void refetch()}>Try again</button>
        </div>
      </section>
    );
  }

  if (!group) return null;

  return (
    <div className="page">
      <Link href={`/groups/${groupId}`} className="back-link">← {group.name}</Link>
      <div className="page-header">
        <div>
          <h1>Game night</h1>
          <p>A little luck, with the player count taken care of.</p>
        </div>
      </div>
      <DrawPanel groupId={groupId} />
    </div>
  );
}
