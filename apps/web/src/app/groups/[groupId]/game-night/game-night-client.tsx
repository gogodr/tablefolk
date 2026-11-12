"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { GroupDetail } from "@tablefolk/contracts";
import { DrawPanel } from "@/components/draw-panel";
import { useApi } from "@/lib/api";

export function GameNightClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const data = await api<{ group: GroupDetail }>(`/v1/groups/${groupId}`); setGroup(data.group); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load game night."); }
    finally { setLoading(false); }
  }, [api, groupId]);
  useEffect(() => { if (isLoaded && isSignedIn) void load(); else if (isLoaded) setLoading(false); }, [isLoaded, isSignedIn, load]);
  if (!isLoaded || loading) return <div className="page"><p className="loading">Preparing game night…</p></div>;
  if (!isSignedIn) return <section className="narrow-page notice-page"><h1>Sign in to pick a game.</h1><Link className="button" href="/sign-in">Sign in</Link></section>;
  if (error || !group) return <section className="narrow-page"><div className="state-message error"><p>{error || "Group not found."}</p><button className="button-quiet" onClick={() => void load()}>Try again</button></div></section>;
  return <div className="page"><Link href={`/groups/${groupId}`} className="back-link">← {group.name}</Link><div className="page-header"><div><h1>Game night</h1><p>A little luck, with the player count taken care of.</p></div></div><DrawPanel groupId={groupId} /></div>;
}
