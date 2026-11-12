"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { publicApi, useApi } from "@/lib/api";

type LinkPreview = { groupName: string; status: "ACTIVE" | "EXPIRED" | "REVOKED"; expiresAt: string | null };

export function JoinClient() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setPreview(await publicApi<LinkPreview>(`/v1/invite-links/${encodeURIComponent(token)}`)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this invite link."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function join() {
    setJoining(true); setError("");
    try {
      const result = await api<{ groupId: string }>(`/v1/invite-links/${encodeURIComponent(token)}/join`, { method: "POST" });
      router.replace(`/groups/${result.groupId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this group.");
      setJoining(false);
      void load();
    }
  }

  return <section className="narrow-page notice-page">
    <img src="/brand/tablefolk-mark.png" alt="" width="56" height="56" />
    
    {loading ? <p className="loading">Loading invite link...</p> : preview ? <>
      <h1>Join {preview.groupName}</h1>
      {preview.status === "ACTIVE" ? <>
        <p>Join this group to share games and pick something to play together.</p>
        {isLoaded && (isSignedIn
          ? <button className="button" disabled={joining} onClick={() => void join()}>{joining ? "Joining..." : "Join group"}</button>
          : <div className="game-actions"><Link className="button" href={`/sign-in?redirect_url=${encodeURIComponent(`/join/${token}`)}`}>Sign in to join</Link><Link className="button-secondary" href={`/sign-up?redirect_url=${encodeURIComponent(`/join/${token}`)}`}>Create account</Link></div>)}
        <p className="field-hint">{preview.expiresAt ? `This link expires ${new Date(preview.expiresAt).toLocaleString()}.` : "This link does not expire."}</p>
      </> : <p>This invite link is {preview.status.toLowerCase()}. Ask the group creator for a new one.</p>}
    </> : <h1>Invite link unavailable</h1>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
