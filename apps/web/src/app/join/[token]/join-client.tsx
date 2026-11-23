"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { publicApi, useApi } from "@/lib/api";

type LinkPreview = { groupName: string; status: "ACTIVE" | "EXPIRED" | "REVOKED"; expiresAt: string | null };

export function JoinClient() {
  const t = useTranslations("invitations");
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
    catch (cause) { setError(cause instanceof Error ? cause.message : t("loadError")); }
    finally { setLoading(false); }
  }, [token, t]);

  useEffect(() => { void load(); }, [load]);

  async function join() {
    setJoining(true); setError("");
    try {
      const result = await api<{ groupId: string }>(`/v1/invite-links/${encodeURIComponent(token)}/join`, { method: "POST" });
      router.replace(`/groups/${result.groupId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("joinError"));
      setJoining(false);
      void load();
    }
  }

  return <section className="narrow-page notice-page">
    <img src="/brand/tablefolk-mark.png" alt="" width="56" height="56" />
    
    {loading ? <p className="loading">{t("loading")}</p> : preview ? <>
      <h1>{t("title", { name: preview.groupName })}</h1>
      {preview.status === "ACTIVE" ? <>
        <p>{t("subtitle")}</p>
        {isLoaded && (isSignedIn
          ? <button className="button" disabled={joining} onClick={() => void join()}>{joining ? t("joining") : t("joinGroup")}</button>
          : <div className="game-actions"><Link className="button" href={`/sign-in?redirect_url=${encodeURIComponent(`/join/${token}`)}`}>{t("signInToJoin")}</Link><Link className="button-secondary" href={`/sign-up?redirect_url=${encodeURIComponent(`/join/${token}`)}`}>{t("createAccount")}</Link></div>)}
        <p className="field-hint">{preview.expiresAt ? t("expiresOn", { date: new Date(preview.expiresAt).toLocaleString() }) : t("doesNotExpire")}</p>
      </> : <p>{t("linkStatusNotice", { status: preview.status.toLowerCase() })}</p>}
    </> : <h1>{t("linkUnavailable")}</h1>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
