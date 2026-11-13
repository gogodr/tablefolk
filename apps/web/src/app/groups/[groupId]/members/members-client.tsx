"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { GroupDetail, GroupInviteLink, Invitation } from "@tablefolk/contracts";
import { useApi } from "@/lib/api";

export function MembersClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useApi();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [links, setLinks] = useState<GroupInviteLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkId, setNewLinkId] = useState("");
  const [expiryMode, setExpiryMode] = useState<"never" | "date">("never");
  const [expiryDate, setExpiryDate] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ group: GroupDetail }>(`/v1/groups/${groupId}`);
      setGroup(data.group);
      if (data.group.creatorId === userId) {
        const [inviteData, linkData] = await Promise.all([
          api<{ invitations: Invitation[] }>(`/v1/groups/${groupId}/invitations`),
          api<{ links: GroupInviteLink[] }>(`/v1/groups/${groupId}/invite-links`),
        ]);
        setInvites(inviteData.invitations);
        setLinks(linkData.links);
      }
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load members."); }
    finally { setLoading(false); }
  }, [api, groupId, userId]);
  useEffect(() => { if (isLoaded && isSignedIn) void load(); else if (isLoaded) setLoading(false); }, [isLoaded, isSignedIn, load]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/v1/groups/${groupId}/invitations`, { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setEmail(""); setSuccess("Invitation sent."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the invitation."); }
    finally { setBusy(false); }
  }

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const expiresAt = expiryMode === "never" ? null : new Date(expiryDate).toISOString();
      const result = await api<{ link: GroupInviteLink; url: string }>(`/v1/groups/${groupId}/invite-links`, {
        method: "POST", body: JSON.stringify({ expiresAt }),
      });
      setNewLinkUrl(result.url);
      setNewLinkId(result.link.id);
      setLinks((current) => [result.link, ...current]);
      setSuccess("Invite link created. Copy it now; it is shown only once.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create invite link."); }
    finally { setBusy(false); }
  }

  async function revokeLink(linkId: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/v1/groups/${groupId}/invite-links/${linkId}`, { method: "DELETE" });
      setLinks((current) => current.map((link) => link.id === linkId ? { ...link, status: "REVOKED" } : link));
      if (newLinkId === linkId) { setNewLinkUrl(""); setNewLinkId(""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke invite link."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(newLinkUrl); setSuccess("Invite link copied."); }
    catch { setError("Could not copy automatically. Select and copy the link below."); }
  }

  async function resend(invitationId: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await api(`/v1/groups/${groupId}/invitations/${invitationId}/resend`, { method: "POST" }); setSuccess("Invitation sent again."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resend invitation."); }
    finally { setBusy(false); }
  }

  async function revoke(invitationId: string) {
    setBusy(true); setError("");
    try { await api(`/v1/groups/${groupId}/invitations/${invitationId}`, { method: "DELETE" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke invitation."); }
    finally { setBusy(false); }
  }

  async function remove(userIdToRemove: string) {
    setBusy(true); setError("");
    try { await api(`/v1/groups/${groupId}/members/${userIdToRemove}`, { method: "DELETE" }); setConfirmRemove(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove member."); }
    finally { setBusy(false); }
  }

  if (!isLoaded || loading) return <div className="page"><p className="loading">Loading members…</p></div>;
  if (!isSignedIn) return <section className="narrow-page notice-page"><h1>Sign in to see members.</h1><Link className="button" href="/sign-in">Sign in</Link></section>;
  if (error && !group) return <section className="narrow-page"><div className="state-message error"><p>{error}</p><button className="button-quiet" onClick={() => void load()}>Try again</button></div></section>;
  if (!group) return null;
  const isCreator = group.creatorId === userId;
  return <div className="page">
    <Link href={`/groups/${groupId}`} className="back-link">← {group.name}</Link>
    <div className="page-header"><div><h1>Members</h1><p>{group.name} has {group.members.length} {group.members.length === 1 ? "member" : "members"}.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}
    <div className="panel">
      <div className="panel-header"><h2>People in the group</h2></div>
      <ul className="member-list">
        {group.members.map((member) => (
          <li key={member.userId} className="member-row">
            <div className="member-identity">
              <span className="member-avatar" aria-hidden="true">
                {member.displayName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{member.displayName}</strong>
                {member.bggUsername && (
                  <div>
                    <a
                      href={`https://boardgamegeek.com/user/${member.bggUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-link"
                      style={{ fontSize: "12px" }}
                    >
                      ↗ BGG: @{member.bggUsername}
                    </a>
                  </div>
                )}
                {member.userId === group.creatorId && <div className="role-note">Group creator</div>}
              </div>
            </div>
            {isCreator && member.userId !== group.creatorId && (
              <button
                className="button-quiet button-small"
                onClick={() => setConfirmRemove(member.userId)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {confirmRemove && <div className="confirm-strip"><span>Remove this member? Their shared games will leave the group unless someone else shares them.</span><button className="button-danger button-small" disabled={busy} onClick={() => void remove(confirmRemove)}>Remove member</button><button className="button-secondary button-small" onClick={() => setConfirmRemove(null)}>Cancel</button></div>}
    </div>
    {isCreator && <>
      <div className="panel"><div className="panel-header"><h2>Invite by link</h2></div>
        <p>Anyone with an active link can join this group after signing in. Share it only with people you want to invite.</p>
        <form className="invite-link-form" onSubmit={createLink}>
          <div className="field"><label htmlFor="link-expiry-mode">Link expiration</label><select id="link-expiry-mode" value={expiryMode} onChange={(event) => setExpiryMode(event.target.value as "never" | "date")}><option value="never">Does not expire</option><option value="date">Set a date and time</option></select></div>
          {expiryMode === "date" && <div className="field"><label htmlFor="link-expiry-date">Expires on</label><input id="link-expiry-date" type="datetime-local" required value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></div>}
          <button className="button" type="submit" disabled={busy}>{busy ? "Creating…" : "Create invite link"}</button>
        </form>
        {newLinkUrl && <div className="created-link"><label htmlFor="created-link-url">New invite URL</label><div className="inline-form"><input id="created-link-url" readOnly value={newLinkUrl} onFocus={(event) => event.target.select()} /><button className="button-secondary" type="button" onClick={() => void copyLink()}>Copy link</button></div><p className="field-hint">This URL is shown only now. You can create another link later.</p></div>}
        {links.length > 0 && <><h3>Created links</h3><ul className="member-list">{links.map((link) => <li className="member-row" key={link.id}><div><strong>{link.status.toLowerCase()}</strong><div className="invite-status">Created {new Date(link.createdAt).toLocaleDateString()} · {link.expiresAt ? `expires ${new Date(link.expiresAt).toLocaleString()}` : "does not expire"} · used {link.joinCount} {link.joinCount === 1 ? "time" : "times"}</div></div>{link.status === "ACTIVE" && <button className="button-quiet button-small" disabled={busy} onClick={() => void revokeLink(link.id)}>Revoke</button>}</li>)}</ul></>}
      </div>
      <div className="panel"><div className="panel-header"><h2>Invite by email</h2></div><form className="inline-form" onSubmit={invite}><div className="field"><label htmlFor="invite-email">Email address</label><input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" /></div><button className="button" type="submit" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button></form><p className="field-hint">The link lasts seven days. Your friend can sign in with email or Google.</p></div>
      <div className="panel"><div className="panel-header"><h2>Invitations</h2></div>{invites.length === 0 ? <p>No invitations sent yet.</p> : <ul className="member-list">{invites.map((invitation) => <li className="member-row" key={invitation.id}><div><strong>{invitation.email}</strong><div className="invite-status">{invitation.status.toLowerCase().replace("_", " ")} · sent {new Date(invitation.createdAt).toLocaleDateString()}</div></div><div className="game-actions">{["PENDING", "EXPIRED", "SEND_FAILED"].includes(invitation.status) && <button className="button-quiet button-small" disabled={busy} onClick={() => void resend(invitation.id)}>Resend</button>}{invitation.status !== "ACCEPTED" && invitation.status !== "REVOKED" && <button className="button-quiet button-small" disabled={busy} onClick={() => void revoke(invitation.id)}>Revoke</button>}</div></li>)}</ul>}</div>
    </>}
  </div>;
}
