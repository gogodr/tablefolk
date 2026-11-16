"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { queryKeys, useGroupsQuery } from "@/lib/queries";

export function GroupsClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const { data, isLoading, error: queryError } = useGroupsQuery();
  const groups = data?.groups ?? [];
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Use at least two characters for the group name.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await api("/v1/groups", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setName("");
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the group.");
    } finally {
      setCreating(false);
    }
  }

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="page">
        <p className="loading">Loading groups…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Find your people.</h1>
        <p>Sign in to create or join a board game group.</p>
        <Link className="button" href="/sign-in">Sign in</Link>
      </section>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Groups</h1>
          <p>Invite friends, share collections, schedule game nights, and pick what to play together.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {!showCreate && groups.length > 0 && (
            <button
              type="button"
              className="button"
              onClick={() => setShowCreate(true)}
            >
              + New Group
            </button>
          )}
          <Link href="/collection" className="button-secondary">
            My collection
          </Link>
        </div>
      </div>

      {/* Expandable Group Creation Panel */}
      {showCreate && (
        <div className="panel" style={{ border: "2px solid var(--accent, #d97706)", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "18px" }}>Start a new group</h2>
            <button
              type="button"
              className="button-quiet button-small"
              onClick={() => {
                setShowCreate(false);
                setError("");
              }}
            >
              ✕ Cancel
            </button>
          </div>
          <form className="inline-form" onSubmit={createGroup}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="group-name">Group name</label>
              <input
                id="group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Friday game night, The Meeple Guild, etc."
                maxLength={80}
                autoFocus
              />
            </div>
            <button className="button" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create group"}
            </button>
          </form>
          {error && <p className="form-error" role="alert" style={{ marginTop: "8px" }}>{error}</p>}
        </div>
      )}

      {/* Groups List First */}
      <div className="section-title">
        <h2>Your groups</h2>
        <p>
          {groups.length} {groups.length === 1 ? "group" : "groups"}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state panel">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h2>Your table is waiting.</h2>
            <p>Create your first group to invite friends, pool your board games, and plan your next game night.</p>
            <form className="inline-form" onSubmit={createGroup} style={{ marginTop: "16px" }}>
              <div className="field">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Friday Game Night"
                  maxLength={80}
                />
              </div>
              <button className="button" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create your first group"}
              </button>
            </form>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="group-list">
          {groups.map((group) => (
            <Link className="group-link" key={group.id} href={`/groups/${group.id}`}>
              <div>
                <h2>{group.name}</h2>
                <p>
                  👥 {group.memberCount} {group.memberCount === 1 ? "member" : "members"} · 🎲{" "}
                  {group.gameCount} {group.gameCount === 1 ? "shared game" : "shared games"}
                </p>
              </div>
              <span className="group-link-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}

          {/* Quick Add Group Link Card at the end of the list */}
          {!showCreate && (
            <button
              type="button"
              className="group-link"
              onClick={() => setShowCreate(true)}
              style={{
                cursor: "pointer",
                background: "transparent",
                border: "2px dashed var(--border)",
                textAlign: "left",
                padding: "16px 22px",
              }}
            >
              <div>
                <strong style={{ fontSize: "16px", color: "var(--accent, #d97706)" }}>+ Start another group</strong>
                <p style={{ margin: "2px 0 0" }}>Create a new table for different friends or coworkers</p>
              </div>
              <span className="group-link-arrow" style={{ color: "var(--accent, #d97706)" }}>
                +
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
