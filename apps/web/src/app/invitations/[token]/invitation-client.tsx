"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { publicApi, useApi } from "@/lib/api";

type InvitationPreview = { groupName: string; status: string; expiresAt: string };

export function InvitationClient() {
  const t = useTranslations("invitations");
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
      setError(cause instanceof Error ? cause.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => { void load(); }, [load]);

  async function accept() {
    setAccepting(true);
    setError("");
    try {
      const result = await api<{ groupId: string }>(`/v1/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });
      router.replace(`/groups/${result.groupId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("joinError"));
      setAccepting(false);
    }
  }

  return <section className="narrow-page notice-page">
    <img src="/brand/tablefolk-mark.png" alt="" width="56" height="56" />
    
    {loading ? <p className="loading">{t("loading")}</p> : preview ? <>
      <h1>{t("title", { name: preview.groupName })}</h1>
      {preview.status === "PENDING" ? <>
        <p>{t("invitedSubtitle")}</p>
        {isLoaded && (isSignedIn
          ? <button className="button" disabled={accepting} onClick={() => void accept()}>{accepting ? t("joining") : t("joinGroup")}</button>
          : <div className="game-actions"><Link className="button" href={`/sign-in?redirect_url=${encodeURIComponent(`/invitations/${token}`)}`}>{t("signInToJoin")}</Link><Link className="button-secondary" href={`/sign-up?redirect_url=${encodeURIComponent(`/invitations/${token}`)}`}>{t("createAccount")}</Link></div>)}
        <p className="field-hint">{t("emailHint", { date: new Date(preview.expiresAt).toLocaleDateString() })}</p>
      </> : <p>{t("statusNotice", { status: preview.status.toLowerCase().replace("_", " ") })}</p>}
    </> : <h1>{t("unavailable")}</h1>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
