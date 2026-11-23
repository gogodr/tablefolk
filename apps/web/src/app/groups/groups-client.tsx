"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { queryKeys, useGroupsQuery } from "@/lib/queries";

export function GroupsClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const t = useTranslations("groupsList");
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const { data, isLoading, error: queryError } = useGroupsQuery();
  const groups = data?.groups ?? [];
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError(t("nameLengthError"));
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
      setError(cause instanceof Error ? cause.message : t("createError"));
    } finally {
      setCreating(false);
    }
  }

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="page">
        <p className="loading">{t("loading")}</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>{t("unauthTitle")}</h1>
        <p>{t("unauthSubtitle")}</p>
        <Link className="button" href="/sign-in">{tNav("signIn")}</Link>
      </section>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {!showCreate && groups.length > 0 && (
            <button
              type="button"
              className="button"
              onClick={() => setShowCreate(true)}
            >
              {t("newGroup")}
            </button>
          )}
          <Link href="/collection" className="button-secondary">
            {t("myCollection")}
          </Link>
        </div>
      </div>

      {/* Expandable Group Creation Panel */}
      {showCreate && (
        <div className="panel" style={{ border: "2px solid var(--accent, #d97706)", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "18px" }}>{t("startNewGroup")}</h2>
            <button
              type="button"
              className="button-quiet button-small"
              onClick={() => {
                setShowCreate(false);
                setError("");
              }}
            >
              ✕ {tCommon("cancel")}
            </button>
          </div>
          <form className="inline-form" onSubmit={createGroup}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="group-name">{t("groupNameLabel")}</label>
              <input
                id="group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("groupNamePlaceholder")}
                maxLength={80}
                autoFocus
              />
            </div>
            <button className="button" type="submit" disabled={creating}>
              {creating ? t("creating") : t("createGroup")}
            </button>
          </form>
          {error && <p className="form-error" role="alert" style={{ marginTop: "8px" }}>{error}</p>}
        </div>
      )}

      {/* Groups List First */}
      <div className="section-title">
        <h2>{t("title")}</h2>
        <p>
          {groups.length} {groups.length === 1 ? t("memberCount", { count: 1 }).split(" ")[1] : t("subtitle")}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state panel">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h2>{t("noGroupsTitle")}</h2>
            <p>{t("noGroupsDesc")}</p>
            <form className="inline-form" onSubmit={createGroup} style={{ marginTop: "16px" }}>
              <div className="field">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("groupNamePlaceholder")}
                  maxLength={80}
                />
              </div>
              <button className="button" type="submit" disabled={creating}>
                {creating ? t("creating") : t("createGroup")}
              </button>
            </form>
            {error && <p className="form-error" role="alert" style={{ marginTop: "8px" }}>{error}</p>}
          </div>
        </div>
      ) : (
        <div className="group-list">
          {groups.map((group) => (
            <Link className="group-link" key={group.id} href={`/groups/${group.id}`}>
              <div>
                <h2>{group.name}</h2>
                <p>
                  👥 {t("memberCount", { count: group.memberCount })} · 🎲{" "}
                  {t("gamesCount", { count: group.gameCount })}
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
                <strong style={{ fontSize: "16px", color: "var(--accent, #d97706)" }}>{t("newGroup")}</strong>
                <p style={{ margin: "2px 0 0" }}>{t("subtitle")}</p>
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
