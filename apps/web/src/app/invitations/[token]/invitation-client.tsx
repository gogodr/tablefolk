"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { publicApi, useApi } from "@/lib/api";

type InvitationPreview = { groupName: string; status: string; expiresAt: string };

export function InvitationClient() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setPreview(await publicApi<InvitationPreview>(`/v1/invitations/${encodeURIComponent(token)}`));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this invitation.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function accept() {
    setAccepting(true);
    setError("");
    try {
      const result = await api<{ groupId: string }>(`/v1/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });
      router.replace(`/groups/${result.groupId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this group.");
      setAccepting(false);
    }
  }

  return <section className="narrow-page notice-page">
    <img src="/brand/tablefolk-mark.png" alt="" width="56" height="56" />
    
    {loading ? <p className="loading">Loading invitation...</p> : preview ? <>
      <h1>Join {preview.groupName}</h1>
      {preview.status === "PENDING" ? <>
        <p>You have been invited to share games and pick something to play together.</p>
        {isLoaded && (isSignedIn
          ? <button className="button" disabled={accepting} onClick={() => void accept()}>{accepting ? "Joining..." : "Join group"}</button>
          : <div className="game-actions"><Link className="button" href={`/sign-in?redirect_url=${encodeURIComponent(`/invitations/${token}`)}`}>Sign in to join</Link><Link className="button-secondary" href={`/sign-up?redirect_url=${encodeURIComponent(`/invitations/${token}`)}`}>Create account</Link></div>)}
        <p className="field-hint">Use the email address that received this invitation. The link expires {new Date(preview.expiresAt).toLocaleDateString()}.</p>
      </> : <p>This invitation is {preview.status.toLowerCase().replace("_", " ")}. Ask the group creator for a new one.</p>}
    </> : <h1>Invitation unavailable</h1>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
