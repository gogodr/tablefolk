"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { GroupSummary } from "@tablefolk/contracts";
import { useApi } from "@/lib/api";

export function ShareControl({
  bggId,
  gameName,
  sharedGroupIds,
  groups,
  onChanged,
  onClose,
}: {
  bggId: number;
  gameName?: string;
  sharedGroupIds: string[];
  groups: GroupSummary[];
  onChanged: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("shareControl");
  const api = useApi();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(groupId: string) {
    setBusyId(groupId);
    setError("");
    const shared = sharedGroupIds.includes(groupId);
    try {
      await api(`/v1/groups/${groupId}/shares${shared ? `/${bggId}` : ""}`, {
        method: shared ? "DELETE" : "POST",
        ...(!shared ? { body: JSON.stringify({ bggId }) } : {}),
      });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error"));
    } finally {
      setBusyId(null);
    }
  }

  if (groups.length === 0) return <p className="muted">{t("noGroups")}</p>;
  return <div>
    <div className="share-list" aria-label={t("ariaLabel")}>
      {groups.map((group) => {
        const shared = sharedGroupIds.includes(group.id);
        return <button key={group.id} type="button" className={`share-pill ${shared ? "active" : ""}`} aria-pressed={shared} disabled={busyId !== null} onClick={() => toggle(group.id)}>
          <span>{group.name}</span><span>{busyId === group.id ? t("saving") : shared ? t("shared") : t("share")}</span>
        </button>;
      })}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
