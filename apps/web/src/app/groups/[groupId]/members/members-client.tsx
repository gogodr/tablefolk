"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GroupInviteLink, Invitation } from "@tablefolk/contracts";
import { useApi } from "@/lib/api";
import { queryKeys, useGroupDetailQuery } from "@/lib/queries";

export function MembersClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data: groupData, isLoading: groupLoading, error: groupQueryError, refetch: refetchGroup } = useGroupDetailQuery(groupId);
  const group = groupData?.group ?? null;

  const [invites, setInvites] = useState<Invitation[]>([]);
  const [links, setLinks] = useState<GroupInviteLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkId, setNewLinkId] = useState("");
  const [expiryMode, setExpiryMode] = useState<"never" | "date">("never");
  const [expiryDate, setExpiryDate] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    if (!group || group.creatorId !== userId) return;
    try {
      const [inviteData, linkData] = await Promise.all([
        api<{ invitations: Invitation[] }>(`/v1/groups/${groupId}/invitations`),
        api<{ links: GroupInviteLink[] }>(`/v1/groups/${groupId}/invite-links`),
      ]);
      setInvites(inviteData.invitations);
      setLinks(linkData.links);
    } catch {}
  }, [api, groupId, group, userId]);

  useEffect(() => {
    if (group?.creatorId === userId) {
      void loadAdminData();
    }
  }, [group?.creatorId, userId, loadAdminData]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(groupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
    ]);
    await loadAdminData();
  }, [groupId, queryClient, loadAdminData]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/v1/groups/${groupId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setEmail("");
      setSuccess("Invitation sent.");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const expiresAt = expiryMode === "never" ? null : new Date(expiryDate).toISOString();
      const result = await api<{ link: GroupInviteLink; url: string }>(`/v1/groups/${groupId}/invite-links`, {
        method: "POST",
        body: JSON.stringify({ expiresAt }),
      });
      setNewLinkUrl(result.url);
      setNewLinkId(result.link.id);
      setLinks((current) => [result.link, ...current]);
      setSuccess("Invite link created. Copy it now; it is shown only once.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invite link.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink(linkId: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/v1/groups/${groupId}/invite-links/${linkId}`, { method: "DELETE" });
      setLinks((current) => current.map((link) => (link.id === linkId ? { ...link, status: "REVOKED" } : link)));
      if (newLinkId === linkId) {
        setNewLinkUrl("");
        setNewLinkId("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke invite link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(newLinkUrl);
      setSuccess("Invite link copied.");
    } catch {
      setError("Could not copy automatically. Select and copy the link below.");
    }
  }

  async function resend(invitationId: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/v1/groups/${groupId}/invitations/${invitationId}/resend`, { method: "POST" });
      setSuccess("Invitation sent again.");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitationId: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/v1/groups/${groupId}/invitations/${invitationId}`, { method: "DELETE" });
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userIdToRemove: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/v1/groups/${groupId}/members/${userIdToRemove}`, { method: "DELETE" });
      setConfirmRemove(null);
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove member.");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded || (isSignedIn && groupLoading)) {
    return (
      <div className="page">
        <p className="loading">Loading members…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Sign in to see members.</h1>
        <Link className="button" href="/sign-in">Sign in</Link>
      </section>
    );
  }

  if (error && !group) {
    return (
      <section className="narrow-page">
        <div className="state-message error">
          <p>{error || (groupQueryError instanceof Error ? groupQueryError.message : "")}</p>
          <button className="button-quiet" onClick={() => void refetchGroup()}>Try again</button>
        </div>
      </section>
    );
  }

  if (!group) return null;
  const isCreator = group.creatorId === userId;

  return (
    <div className="page">
      <Link href={`/groups/${groupId}`} className="back-link">← {group.name}</Link>
      <div className="page-header">
        <div>
          <h1>Members</h1>
          <p>{group.name} has {group.members.length} {group.members.length === 1 ? "member" : "members"}.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <div className="panel">
        <h2>Current members</h2>
        <ul className="member-list">
          {group.members.map((member) => (
            <li key={member.userId} className="member-row">
              <div>
                <strong>{member.displayName}</strong>
                {member.userId === group.creatorId && <span className="badge">Creator</span>}
              </div>
              {isCreator && member.userId !== userId && (
                <div>
                  {confirmRemove === member.userId ? (
                    <>
                      <button className="button-danger button-small" disabled={busy} onClick={() => void remove(member.userId)}>
                        Confirm remove
                      </button>
                      <button className="button-quiet button-small" disabled={busy} onClick={() => setConfirmRemove(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="button-quiet button-small" disabled={busy} onClick={() => setConfirmRemove(member.userId)}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isCreator && (
        <>
          <div className="panel">
            <h2>Invite link</h2>
            <p className="muted">Anyone with the link can join {group.name}.</p>
            <form className="inline-form" onSubmit={createLink}>
              <div className="field">
                <label htmlFor="expiry-mode">Expires</label>
                <select
                  id="expiry-mode"
                  value={expiryMode}
                  onChange={(event) => setExpiryMode(event.target.value as "never" | "date")}
                >
                  <option value="never">Never</option>
                  <option value="date">On date…</option>
                </select>
              </div>
              {expiryMode === "date" && (
                <div className="field">
                  <label htmlFor="expiry-date">Expiration</label>
                  <input
                    id="expiry-date"
                    type="datetime-local"
                    value={expiryDate}
                    onChange={(event) => setExpiryDate(event.target.value)}
                    required
                  />
                </div>
              )}
              <button className="button" type="submit" disabled={busy}>
                Generate link
              </button>
            </form>

            {newLinkUrl && (
              <div className="invite-link-box">
                <input readOnly value={newLinkUrl} onFocus={(e) => e.target.select()} />
                <button className="button button-small" type="button" onClick={() => void copyLink()}>
                  Copy
                </button>
              </div>
            )}

            {links.length > 0 && (
              <ul className="member-list" style={{ marginTop: "1rem" }}>
                {links.map((link) => (
                  <li key={link.id} className="member-row">
                    <div>
                      <code>{link.id.slice(0, 8)}…</code>
                      <span className="muted" style={{ marginLeft: "0.5rem" }}>
                        {link.status === "REVOKED"
                          ? "Revoked"
                          : link.expiresAt
                          ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
                          : "Never expires"}
                        {link.joinCount > 0 && ` · ${link.joinCount} uses`}
                      </span>
                    </div>
                    {link.status === "ACTIVE" && (
                      <button className="button-quiet button-small" disabled={busy} onClick={() => void revokeLink(link.id)}>
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h2>Invite by email</h2>
            <form className="inline-form" onSubmit={invite}>
              <div className="field">
                <label htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="friend@example.com"
                  required
                />
              </div>
              <button className="button" type="submit" disabled={busy}>
                Send invite
              </button>
            </form>

            {invites.length > 0 && (
              <ul className="member-list" style={{ marginTop: "1rem" }}>
                {invites.map((inv) => (
                  <li key={inv.id} className="member-row">
                    <div>
                      <strong>{inv.email}</strong>
                      <span className="muted" style={{ marginLeft: "0.5rem" }}>
                        {inv.status}
                      </span>
                    </div>
                    {inv.status === "PENDING" && (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="button-quiet button-small" disabled={busy} onClick={() => void resend(inv.id)}>
                          Resend
                        </button>
                        <button className="button-quiet button-small" disabled={busy} onClick={() => void revoke(inv.id)}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
