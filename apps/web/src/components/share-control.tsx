"use client";

import { useState } from "react";
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
      setError(cause instanceof Error ? cause.message : "Could not change sharing.");
    } finally {
      setBusyId(null);
    }
  }

  if (groups.length === 0) {
    return (
      <div className="share-panel panel">
        <p className="muted">You haven&apos;t joined any groups yet. Create or join a group first to share this game.</p>
      </div>
    );
  }

  return (
    <div className="share-panel panel">
      <div className="share-panel-header">
        <div>
          <h4>Share with Groups</h4>
          {gameName && <span className="share-panel-subtitle">{gameName}</span>}
        </div>
        {onClose && (
          <button type="button" className="button-quiet button-small" onClick={onClose}>
            ✕ Close
          </button>
        )}
      </div>

      <div className="share-groups-list">
        {groups.map((group) => {
          const isShared = sharedGroupIds.includes(group.id);
          const isBusy = busyId === group.id;
          return (
            <div
              key={group.id}
              className={`share-group-row ${isShared ? "shared" : ""}`}
              onClick={() => !isBusy && void toggle(group.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!isBusy) void toggle(group.id);
                }
              }}
            >
              <div className="share-group-info">
                <strong>{group.name}</strong>
                <span className="share-group-meta">
                  {isShared ? "✓ Shared with this group" : "Not shared"}
                </span>
              </div>
              <button
                type="button"
                className={`button-small ${isShared ? "button" : "button-secondary"}`}
                disabled={isBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  void toggle(group.id);
                }}
              >
                {isBusy ? "Saving…" : isShared ? "✓ Shared" : "+ Share"}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
