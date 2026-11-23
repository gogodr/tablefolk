"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { GroupSummary } from "@tablefolk/contracts";
import { useApi } from "@/lib/api";
import { cleanExpansionName } from "@/components/game-card";

interface AttachedExpansion {
  bggId: number;
  name: string;
  maxPlayers?: number | null;
  sharedGroupIds?: string[];
}

export function ShareControl({
  bggId,
  gameName,
  baseGameTitle,
  expansions,
  sharedGroupIds,
  groups,
  onChanged,
  onClose,
}: {
  bggId: number;
  gameName?: string;
  baseGameTitle?: string | null;
  expansions?: AttachedExpansion[];
  sharedGroupIds: string[];
  groups: GroupSummary[];
  onChanged: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("shareControl");
  const api = useApi();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggleBase(groupId: string) {
    setBusyKey(groupId);
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
      setBusyKey(null);
    }
  }

  async function toggleExpansion(groupId: string, expBggId: number, currentlyShared: boolean) {
    const key = `${groupId}:${expBggId}`;
    setBusyKey(key);
    setError("");
    try {
      await api(`/v1/groups/${groupId}/shares${currentlyShared ? `/${expBggId}` : ""}`, {
        method: currentlyShared ? "DELETE" : "POST",
        ...(!currentlyShared ? { body: JSON.stringify({ bggId: expBggId }) } : {}),
      });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error"));
    } finally {
      setBusyKey(null);
    }
  }

  if (groups.length === 0) return <p className="muted">{t("noGroups")}</p>;

  return (
    <div className="share-control-container">
      {baseGameTitle && (
        <div className="share-basegame-notice">
          <span>🎲 <strong>{t("includesBaseGame", { baseGame: baseGameTitle })}</strong></span>
          <p className="field-hint">{t("baseGameShareHint")}</p>
        </div>
      )}

      {expansions && expansions.length > 0 && (
        <div className="share-expansions-notice">
          <span>📦 <strong>{t("includesExpansions", { count: expansions.length })}</strong></span>
          <p className="field-hint">{t("expansionsShareHint")}</p>
        </div>
      )}

      <div className="share-list" aria-label={t("ariaLabel")}>
        {groups.map((group) => {
          const shared = sharedGroupIds.includes(group.id);
          const isGroupBusy = busyKey === group.id;

          return (
            <div key={group.id} className="share-group-card">
              <button
                type="button"
                className={`share-pill ${shared ? "active" : ""}`}
                aria-pressed={shared}
                disabled={busyKey !== null}
                onClick={() => toggleBase(group.id)}
              >
                <span>{group.name}</span>
                <span>{isGroupBusy ? t("saving") : shared ? t("shared") : t("share")}</span>
              </button>

              {shared && expansions && expansions.length > 0 && (
                <div className="share-attached-expansions-panel">
                  <span className="share-attached-expansions-title">
                    📦 {t("sharedExpansionsTitle", { count: expansions.length })}:
                  </span>
                  <ul className="share-attached-expansions-checks">
                    {expansions.map((exp) => {
                      const isExpShared = exp.sharedGroupIds?.includes(group.id) ?? false;
                      const expBusyKey = `${group.id}:${exp.bggId}`;
                      const isThisExpBusy = busyKey === expBusyKey;

                      return (
                        <li key={exp.bggId}>
                          <label className="share-expansion-checkbox-label">
                            <input
                              type="checkbox"
                              checked={isExpShared}
                              disabled={busyKey !== null}
                              onChange={() => toggleExpansion(group.id, exp.bggId, isExpShared)}
                            />
                            <span className={isThisExpBusy ? "opacity-muted" : ""}>
                              {cleanExpansionName(gameName || "", exp.name)}
                              {exp.maxPlayers && (
                                <span className="expansion-chip-bump"> (up to {exp.maxPlayers}p)</span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
