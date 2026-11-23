"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { DrawPanel } from "@/components/draw-panel";
import { useGroupDetailQuery } from "@/lib/queries";

export function GameNightClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const t = useTranslations("gameNight");
  const tCommon = useTranslations("common");
  const { data, isLoading, error: queryError, refetch } = useGroupDetailQuery(groupId);
  const group = data?.group ?? null;

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="page">
        <p className="loading">{t("preparing")}</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>{t("signInPrompt")}</h1>
        <Link className="button" href="/sign-in">{tCommon("signIn") ?? "Sign in"}</Link>
      </section>
    );
  }

  if (queryError || (!isLoading && !group)) {
    return (
      <section className="narrow-page">
        <div className="state-message error">
          <p>{(queryError instanceof Error ? queryError.message : "") || t("groupNotFound")}</p>
          <button className="button-quiet" onClick={() => void refetch()}>{t("tryAgain")}</button>
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
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </div>
      <DrawPanel groupId={groupId} />
    </div>
  );
}
