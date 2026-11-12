"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { GroupSummary } from "@tablefolk/contracts";
import { useApi } from "@/lib/api";

export function GroupsClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { const data = await api<{ groups: GroupSummary[] }>("/v1/groups"); setGroups(data.groups); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load groups."); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { if (isLoaded && isSignedIn) void load(); else if (isLoaded) setLoading(false); }, [isLoaded, isSignedIn, load]);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) { setError("Use at least two characters for the group name."); return; }
    setCreating(true);
    setError("");
    try {
      await api("/v1/groups", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the group."); }
    finally { setCreating(false); }
  }

  if (!isLoaded || loading) return <div className="page"><p className="loading">Loading groups…</p></div>;
  if (!isSignedIn) return <section className="narrow-page notice-page"><h1>Find your people.</h1><p>Sign in to create or join a board game group.</p><Link className="button" href="/sign-in">Sign in</Link></section>;
  return <div className="page">
    <div className="page-header"><div><h1>Groups</h1><p>Invite friends, share your games, and choose what to play together.</p></div><Link href="/collection" className="button-secondary">My collection</Link></div>
    <div className="panel">
      <div className="panel-header"><h2>Start a group</h2></div>
      <form className="inline-form" onSubmit={createGroup}>
        <div className="field"><label htmlFor="group-name">Group name</label><input id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday game night" maxLength={80} /></div>
        <button className="button" type="submit" disabled={creating}>{creating ? "Creating…" : "Create group"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="section-title"><h2>Your groups</h2><p>{groups.length} {groups.length === 1 ? "group" : "groups"}</p></div>
    {groups.length === 0 ? <div className="empty-state"><img src="/brand/tablefolk-mark.png" alt="" /><div><h2>Your table is waiting.</h2><p>Create a group above or accept an invitation from a friend.</p></div></div> : <div className="group-list">
      {groups.map((group) => <Link className="group-link" key={group.id} href={`/groups/${group.id}`}><div><h2>{group.name}</h2><p>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.gameCount} {group.gameCount === 1 ? "shared game" : "shared games"}</p></div><span className="group-link-arrow" aria-hidden="true">→</span></Link>)}
    </div>}
  </div>;
}
