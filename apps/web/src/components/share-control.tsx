"use client";

import { useState } from "react";
import type { GroupSummary } from "@tablefolk/contracts";
import { useApi } from "@/lib/api";

export function ShareControl({ bggId, sharedGroupIds, groups, onChanged }: {
  bggId: number;
  sharedGroupIds: string[];
  groups: GroupSummary[];
  onChanged: () => void;
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
    } finally { setBusyId(null); }
  }

  if (groups.length === 0) return <p className="muted">Create a group to share this game.</p>;
  return <div>
    <div className="share-list" aria-label="Share with groups">
      {groups.map((group) => {
        const shared = sharedGroupIds.includes(group.id);
        return <button key={group.id} type="button" className={`share-pill ${shared ? "active" : ""}`} aria-pressed={shared} disabled={busyId !== null} onClick={() => toggle(group.id)}>
          <span>{group.name}</span><span>{busyId === group.id ? "Saving…" : shared ? "Shared" : "Share"}</span>
        </button>;
      })}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
