"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EventDetail, GroupGame, PickResult, SessionLineupResult } from "@tablefolk/contracts";
import { SESSION_TEMPLATES } from "@tablefolk/contracts";
import { GameCard, cleanExpansionName } from "@/components/game-card";
import { useApi } from "@/lib/api";
import { useGroupGamesQuery } from "@/lib/queries";

type Mode = "lineup" | "single";

interface GameOwnerSummary {
  userId: string;
  displayName: string;
  count: number;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function DrawPanel({ groupId }: { groupId: string }) {
  const api = useApi();
  const router = useRouter();
  const t = useTranslations("draw");
  const tCommon = useTranslations("common");
  const tTemplates = useTranslations("templates");
  const [mode, setMode] = useState<Mode>("lineup");

  // Common headcount
  const [playerCount, setPlayerCount] = useState<string>("4");

  // Single Pick states
  const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined);
  const [maxWeight, setMaxWeight] = useState<number | undefined>(undefined);
  const [singleResult, setSingleResult] = useState<PickResult | null>(null);

  // Lineup states
  const [totalMinutes, setTotalMinutes] = useState<number>(180);
  const [allowHeavy, setAllowHeavy] = useState<boolean>(true);
  const [mechanicsAffinity, setMechanicsAffinity] = useState<number>(0);
  const [themeCategory, setThemeCategory] = useState<string>("");
  const [recipeId, setRecipeId] = useState<string>("");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [lineupResult, setLineupResult] = useState<SessionLineupResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // Contributors / Attendees filtering
  const { data: groupGamesData } = useGroupGamesQuery(groupId);
  const [allGames, setAllGames] = useState<GroupGame[]>([]);
  const [owners, setOwners] = useState<GameOwnerSummary[]>([]);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!groupGamesData?.games) return;
    const games = groupGamesData.games;
    setAllGames(games);

    const countMap = new Map<string, GameOwnerSummary>();
    for (const game of games) {
      for (const owner of game.owners) {
        const current = countMap.get(owner.userId);
        if (current) {
          current.count += 1;
        } else {
          countMap.set(owner.userId, {
            userId: owner.userId,
            displayName: owner.displayName,
            count: 1,
          });
        }
      }
    }
    const list = [...countMap.values()]
      .filter((o) => o.count >= 1)
      .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));
    setOwners(list);
    setSelectedOwnerIds(list.map((o) => o.userId));
  }, [groupGamesData?.games]);

  // Dynamically update available themes based on active contributors
  useEffect(() => {
    if (allGames.length === 0) return;
    const activeGames = selectedOwnerIds.length > 0
      ? allGames.filter((g) => g.owners.some((o) => selectedOwnerIds.includes(o.userId)))
      : [];
    const categories = Array.from(
      new Set(activeGames.flatMap((g) => (g.categories ?? []).map(decodeHtmlEntities)))
    ).filter(Boolean).sort((a, b) => a.localeCompare(b));
    setAvailableCategories(categories);
  }, [allGames, selectedOwnerIds]);

  function toggleOwner(userId: string) {
    setSelectedOwnerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function selectAllOwners() {
    setSelectedOwnerIds(owners.map((o) => o.userId));
  }

  function deselectAllOwners() {
    setSelectedOwnerIds([]);
  }

  async function handleSinglePick(reroll = false) {
    const count = Number(playerCount);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError(t("playerCountError"));
      return;
    }
    if (owners.length > 0 && selectedOwnerIds.length === 0) {
      setError(t("noContributorsSelected"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<PickResult>(`/v1/groups/${groupId}/picks`, {
        method: "POST",
        body: JSON.stringify({
          playerCount: count,
          maxDuration,
          maxWeight,
          includedOwnerIds: selectedOwnerIds.length > 0 ? selectedOwnerIds : undefined,
          ...(reroll && singleResult?.status === "picked" ? { excludeBggId: singleResult.game.bggId } : {}),
        }),
      });
      setSingleResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("pickError"));
    } finally {
      setBusy(false);
    }
  }

  async function handlePlanLineup(reroll = false) {
    const count = Number(playerCount);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError(t("playerCountError"));
      return;
    }
    if (owners.length > 0 && selectedOwnerIds.length === 0) {
      setError(t("noContributorsSelected"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const excludeBggIds = reroll && lineupResult?.lineup
        ? lineupResult.lineup.map((s) => s.game.bggId)
        : [];
      const data = await api<SessionLineupResult>(`/v1/groups/${groupId}/lineup`, {
        method: "POST",
        body: JSON.stringify({
          playerCount: count,
          totalMinutes,
          allowHeavy,
          excludeBggIds,
          mechanicsAffinity,
          themeCategory: themeCategory || undefined,
          recipeId: recipeId || undefined,
          includedOwnerIds: selectedOwnerIds.length > 0 ? selectedOwnerIds : undefined,
        }),
      });
      setLineupResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("lineupError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAsEvent() {
    if (!lineupResult || lineupResult.lineup.length === 0) return;
    setSavingEvent(true);
    setError("");

    try {
      const dateStr = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const { event } = await api<{ event: EventDetail }>(`/v1/groups/${groupId}/events`, {
        method: "POST",
        body: JSON.stringify({
          title: `Game Night (${dateStr})`,
          scheduledDate: new Date().toISOString(),
          manualHeadcount: Number(playerCount) || 4,
        }),
      });

      await api(`/v1/events/${event.id}/official`, {
        method: "PUT",
        body: JSON.stringify({
          type: "lineup",
          lineup: lineupResult.lineup.map((s) => ({
            role: s.role,
            label: s.label,
            bggId: s.game.bggId,
            name: s.game.name,
            estimatedMinutes: s.estimatedMinutes,
            carrierDisplayName: s.game.owners[0]?.displayName ?? undefined,
            expansions: s.game.expansions?.map((e) => ({ bggId: e.bggId, name: e.name })),
          })),
        }),
      });

      router.push(`/groups/${groupId}/events/${event.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("saveEventError"));
      setSavingEvent(false);
    }
  }

  const TEMPLATE_ALIAS_MAP: Record<string, string> = {
    party_and_push: "party_mayhem",
    cooperative_challenge: "cooperative_survival",
    engine_combos: "engine_building",
    high_interaction: "social_deduction",
    thematic_adventure: "thematic_narrative",
    group_favorites: "table_favorites",
    accessible_classics: "accessible_gateway",
  };

  function getTemplateBadge(id: string, fallback?: string): string {
    const key = TEMPLATE_ALIAS_MAP[id] ?? id;
    try {
      const val = tTemplates(`${key}.badge`);
      if (val && !val.startsWith("templates.")) return val;
      return fallback ?? id;
    } catch {
      return fallback ?? id;
    }
  }

  function getTemplateDesc(id: string, fallback?: string): string {
    const key = TEMPLATE_ALIAS_MAP[id] ?? id;
    try {
      const val = tTemplates(`${key}.description`);
      if (val && !val.startsWith("templates.")) return val;
      return fallback ?? "";
    } catch {
      return fallback ?? "";
    }
  }

  function getLocalizedSlotLabel(slot: SessionLineupResult["lineup"][number]): string {
    if (slot.role === "main") {
      return (slot.game.weight ?? 0) >= 3.2 ? t("roleMainHeavy") : t("roleMain");
    }
    if (slot.role === "warmup") return t("roleWarmup");
    if (slot.role === "cooldown") return t("roleCooldown");
    if (slot.role === "filler") return t("roleFiller");
    return slot.label;
  }

  function getLocalizedTransitionReason(minutes?: number): string {
    const m = minutes ?? 15;
    if (m >= 30) return t("transitionHeavy", { minutes: m });
    if (m >= 25) return t("transitionMediumHeavy", { minutes: m });
    if (m >= 20) return t("transitionMedium", { minutes: m });
    return t("transitionLight", { minutes: m });
  }

  function getLocalizedThemeNotice(notice?: string): string | undefined {
    if (!notice) return undefined;
    if (notice.includes("Diverse Menu") || notice.includes("contrasting mechanics")) {
      return t("themeNoticeDiverse");
    }
    if (notice.includes("aligned mechanics")) {
      return t("themeNoticeAligned");
    }
    const match = notice.match(/(?:Themed Night:\s*(?:features\s*)?)(.*)/i);
    if (match && match[1]) {
      return t("themeNoticeThemed", { theme: match[1].trim() });
    }
    return notice;
  }

  function handleCopyLineup() {
    if (!lineupResult || lineupResult.lineup.length === 0) return;
    const activeRecipeId = lineupResult.recipeId;
    const templateName = activeRecipeId
      ? getTemplateBadge(activeRecipeId, lineupResult.recipeBadge)
      : (lineupResult.recipeBadge ?? lineupResult.recipeTitle);
    const textLines = [
      t("clipboardTitle"),
      ...(templateName ? [t("clipboardTemplate", { name: templateName })] : []),
      `${t("clipboardPlannedTime", { minutes: lineupResult.totalEstimatedMinutes })}${
        lineupResult.transitionMinutes ? t("clipboardBuffer", { minutes: lineupResult.transitionMinutes }) : ""
      }`,
      "",
      ...lineupResult.lineup.flatMap((s, idx) => {
        const expText = s.game.expansions && s.game.expansions.length > 0
          ? ` (+ ${s.game.expansions.map((e) => cleanExpansionName(s.game.name, e.name)).join(", ")})`
          : "";
        const roleLabel = getLocalizedSlotLabel(s);
        const bufferLabel = getLocalizedTransitionReason(s.transitionBeforeMinutes);
        return [
          ...(idx > 0 && s.transitionBeforeMinutes ? [`  ${bufferLabel}`] : []),
          `• ${roleLabel}: *${s.game.name}*${expText} (~${s.estimatedMinutes} min)`,
        ];
      }),
    ];
    void navigator.clipboard.writeText(textLines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const hasNoSelectedContributors = owners.length > 0 && selectedOwnerIds.length === 0;

  return (
    <div className="draw-container">
      {/* Mode switcher pills */}
      <div className="section-title" style={{ marginBottom: 20 }}>
        <div>
          <h2>{t("modeTitle")}</h2>
          <p>{t("modeSubtitle")}</p>
        </div>
        <div className="share-pills">
          <button
            type="button"
            className={`count-filter ${mode === "lineup" ? "active" : ""}`}
            onClick={() => setMode("lineup")}
          >
            <span>{t("sessionMenu")}</span>
            <strong>{t("multiGame")}</strong>
          </button>
          <button
            type="button"
            className={`count-filter ${mode === "single" ? "active" : ""}`}
            onClick={() => setMode("single")}
          >
            <span>{t("singlePick")}</span>
            <strong>{t("oneTitle")}</strong>
          </button>
        </div>
      </div>

      {owners.length > 0 && (
        <div className="draw-owners-strip panel">
          <div className="draw-owners-label">
            <span className="draw-owners-icon">🎲</span>
            <strong>{t("contributedBy")}</strong>
            <span style={{ fontWeight: "normal", color: "var(--muted)" }}>
              {t("presentMembers", { count: selectedOwnerIds.length, total: owners.length })}
            </span>
          </div>

          <div className="draw-owners-actions">
            <button
              type="button"
              className="draw-owners-quick-btn"
              onClick={selectAllOwners}
              title={t("selectAll")}
            >
              {t("selectAll")}
            </button>
            <span style={{ color: "var(--border)" }} aria-hidden="true">|</span>
            <button
              type="button"
              className="draw-owners-quick-btn"
              onClick={deselectAllOwners}
              title={t("deselectAll")}
            >
              {t("deselectAll")}
            </button>
          </div>

          <div className="draw-owners-chips" role="group" aria-label={t("contributedBy")}>
            {owners.map((owner) => {
              const isActive = selectedOwnerIds.includes(owner.userId);
              return (
                <button
                  key={owner.userId}
                  type="button"
                  className={`draw-owner-chip ${isActive ? "active" : "inactive"}`}
                  onClick={() => toggleOwner(owner.userId)}
                  aria-pressed={isActive}
                  title={`${owner.displayName} (${owner.count})`}
                >
                  <span className="draw-owner-chip-indicator" aria-hidden="true">
                    {isActive ? "✓" : "–"}
                  </span>
                  <span>{owner.displayName}</span>
                  <strong className="owner-chip-count">({owner.count})</strong>
                </button>
              );
            })}
          </div>

          <p className="draw-owners-hint">{t("toggleHint")}</p>
        </div>
      )}

      <div className="draw-layout">
        <section className="draw-card">
          <div className="draw-card-header">
            <h2>{mode === "lineup" ? t("sessionPlannerTitle") : t("singlePickTitle")}</h2>
            <p>
              {mode === "lineup" ? t("sessionPlannerDesc") : t("singlePickDesc")}
            </p>
          </div>

          <div className="draw-card-form">
            <div className="field">
              <label htmlFor="draw-player-count">{t("playerCountLabel")}</label>
              <input
                id="draw-player-count"
                type="number"
                min={1}
                max={1000}
                value={playerCount}
                onChange={(e) => setPlayerCount(e.target.value)}
                placeholder={t("playerCountPlaceholder")}
              />
            </div>

            {mode === "lineup" ? (
              <>
                <div className="field">
                  <label>{t("gatheringDurationLabel")}</label>
                  <div className="filter-pill-group">
                    <button
                      type="button"
                      className={`filter-pill ${totalMinutes === 120 ? "active" : ""}`}
                      onClick={() => setTotalMinutes(120)}
                    >
                      {t("durationHours", { hours: 2, minutes: 120 })}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${totalMinutes === 180 ? "active" : ""}`}
                      onClick={() => setTotalMinutes(180)}
                    >
                      {t("durationHours", { hours: 3, minutes: 180 })}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${totalMinutes === 240 ? "active" : ""}`}
                      onClick={() => setTotalMinutes(240)}
                    >
                      {t("durationHours", { hours: 4, minutes: 240 })}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${totalMinutes === 300 ? "active" : ""}`}
                      onClick={() => setTotalMinutes(300)}
                    >
                      {t("durationHours", { hours: 5, minutes: 300 })}
                    </button>
                  </div>
                </div>

                <label className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={allowHeavy}
                    onChange={(e) => setAllowHeavy(e.target.checked)}
                  />
                  <span>{t("allowHeavyLabel")}</span>
                </label>

                <div className="field">
                  <label htmlFor="draw-recipe-id">
                    📋 {t("templateSelectorLabel")}{" "}
                    <span style={{ fontWeight: "normal", color: "var(--muted)" }}>{t("optional")}</span>
                  </label>
                  <select
                    id="draw-recipe-id"
                    className="select"
                    value={recipeId}
                    onChange={(e) => setRecipeId(e.target.value)}
                  >
                    <option value="">{t("templateAuto")}</option>
                    {SESSION_TEMPLATES.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {getTemplateBadge(tmpl.id, tmpl.styleBadge)}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    {recipeId
                      ? getTemplateDesc(recipeId, SESSION_TEMPLATES.find((tmpl) => tmpl.id === recipeId)?.description)
                      : t("templateAutoHint")}
                  </p>
                </div>

                {availableCategories.length > 0 && (
                  <div className="field">
                    <label htmlFor="draw-theme-category">
                      🎭 {t("themeSettingLabel")} <span style={{ fontWeight: "normal", color: "var(--muted)" }}>{t("optional")}</span>
                    </label>
                    <select
                      id="draw-theme-category"
                      className="select"
                      value={themeCategory}
                      onChange={(e) => setThemeCategory(e.target.value)}
                    >
                      <option value="">{t("openCollection")}</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <p className="field-hint">
                      {t("themeSettingHint")}
                    </p>
                  </div>
                )}

                <div className="field affinity-slider-field">
                  <div className="affinity-slider-header">
                    <label htmlFor="mechanics-affinity">
                      {t("affinityLabel")}
                    </label>
                    <span className={`affinity-badge ${mechanicsAffinity > 0 ? "affinity-theme" : mechanicsAffinity < 0 ? "affinity-diverse" : "affinity-neutral"}`}>
                      {mechanicsAffinity === 0 && t("affinityBalanced")}
                      {mechanicsAffinity > 0 && mechanicsAffinity <= 0.5 && t("affinitySimilar")}
                      {mechanicsAffinity > 0.5 && t("affinityThemed")}
                      {mechanicsAffinity < 0 && mechanicsAffinity >= -0.5 && t("affinityDiverse")}
                      {mechanicsAffinity < -0.5 && t("affinityMaxVariety")}
                    </span>
                  </div>
                  <div className="affinity-slider-control">
                    <span className="slider-label slider-label-left">{t("sliderVariety")}</span>
                    <input
                      id="mechanics-affinity"
                      type="range"
                      min="-1"
                      max="1"
                      step="0.25"
                      value={mechanicsAffinity}
                      onChange={(e) => setMechanicsAffinity(parseFloat(e.target.value))}
                    />
                    <span className="slider-label slider-label-right">{t("sliderThemed")}</span>
                  </div>
                  <p className="field-hint">
                    {mechanicsAffinity === 0 && t("affinityHintNeutral")}
                    {mechanicsAffinity > 0 && t("affinityHintThemed")}
                    {mechanicsAffinity < 0 && t("affinityHintVariety")}
                  </p>
                </div>

                <button
                  type="button"
                  className="button button-large"
                  disabled={busy || !playerCount || hasNoSelectedContributors}
                  onClick={() => void handlePlanLineup(false)}
                >
                  {busy ? t("composingLineup") : t("planEveningMenu")}
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <label>{t("maxPlayingTimeLabel")}</label>
                  <div className="filter-pill-group">
                    <button
                      type="button"
                      className={`filter-pill ${maxDuration === undefined ? "active" : ""}`}
                      onClick={() => setMaxDuration(undefined)}
                    >
                      {t("anyLength")}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxDuration === 45 ? "active" : ""}`}
                      onClick={() => setMaxDuration(45)}
                    >
                      {t("shortTime")}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxDuration === 90 ? "active" : ""}`}
                      onClick={() => setMaxDuration(90)}
                    >
                      {t("standardTime")}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxDuration === 150 ? "active" : ""}`}
                      onClick={() => setMaxDuration(150)}
                    >
                      {t("longTime")}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>{t("maxComplexityLabel")}</label>
                  <div className="filter-pill-group">
                    <button
                      type="button"
                      className={`filter-pill ${maxWeight === undefined ? "active" : ""}`}
                      onClick={() => setMaxWeight(undefined)}
                    >
                      {t("anyWeight")}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxWeight === 2.2 ? "active" : ""}`}
                      onClick={() => setMaxWeight(2.2)}
                    >
                      {t("lightWeight")}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxWeight === 3.2 ? "active" : ""}`}
                      onClick={() => setMaxWeight(3.2)}
                    >
                      {t("mediumWeight")}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxWeight === 4.5 ? "active" : ""}`}
                      onClick={() => setMaxWeight(4.5)}
                    >
                      {t("heavyWeight")}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="button button-large"
                  disabled={busy || !playerCount || hasNoSelectedContributors}
                  onClick={() => void handleSinglePick(false)}
                >
                  {busy ? t("picking") : t("pickAGame")}
                </button>
              </>
            )}

            {hasNoSelectedContributors && (
              <p className="form-error" role="alert">{t("noContributorsSelected")}</p>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </section>

        {/* Results Panel */}
        <section className="draw-card draw-result" aria-live="polite">
          {mode === "lineup" ? (
            !lineupResult ? (
              <div>
                <h2>{t("readyLineupTitle")}</h2>
                <p>{t("readyLineupDesc")}</p>
                <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
              </div>
            ) : lineupResult.status === "empty" || lineupResult.lineup.length === 0 ? (
              <div className="no-match">
                <img src="/brand/tablefolk-mark.png" alt="" />
                <div>
                  <h2>{t("noLineupFoundTitle")}</h2>
                  <p>{t("noLineupFoundDesc")}</p>
                </div>
              </div>
            ) : (
              <div>
                <span className="draw-result-intro">
                  {t("lineupIntro", {
                    minutes: lineupResult.totalEstimatedMinutes,
                    target: lineupResult.targetMinutes,
                  })}
                  {lineupResult.transitionMinutes ? ` ${t("bufferIncluded", { minutes: lineupResult.transitionMinutes })}` : ""}
                </span>
                <h2>{t("menuTitle")}</h2>
                {(lineupResult.recipeBadge || lineupResult.recipeTitle) && (() => {
                  const activeRecipeId = lineupResult.recipeId;
                  const activeBadge = activeRecipeId
                    ? getTemplateBadge(activeRecipeId, lineupResult.recipeBadge)
                    : (lineupResult.recipeBadge ?? lineupResult.recipeTitle);
                  const activeDesc = activeRecipeId
                    ? getTemplateDesc(activeRecipeId, lineupResult.recipeDescription)
                    : lineupResult.recipeDescription;
                  return (
                    <div className="lineup-recipe-banner">
                      <div className="lineup-recipe-header">
                        <span className="lineup-recipe-tag">📋 {t("activeTemplateLabel")}</span>
                        <span className="lineup-recipe-badge">{activeBadge}</span>
                      </div>
                      {activeDesc && (
                        <p className="lineup-recipe-desc">{activeDesc}</p>
                      )}
                    </div>
                  );
                })()}
                {lineupResult.themeNotice && (
                  <div className="lineup-theme-notice">
                    {getLocalizedThemeNotice(lineupResult.themeNotice)}
                  </div>
                )}

                <div className="lineup-slots">
                  {lineupResult.lineup.map((slot, idx) => (
                    <div key={slot.game.bggId} style={{ display: "contents" }}>
                      {idx > 0 && (
                        <div className="lineup-buffer-pill">
                          {getLocalizedTransitionReason(slot.transitionBeforeMinutes)}
                        </div>
                      )}
                      <div className="lineup-slot-card panel">
                        <div className="lineup-slot-header">
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                            <span className="slot-role-badge">{getLocalizedSlotLabel(slot)}</span>
                            {slot.sharedMechanics && slot.sharedMechanics.length > 0 && (
                              <span className="slot-shared-chip" title="Shared mechanics with main game">
                                {t("sharedMechanics", { mechanics: slot.sharedMechanics.slice(0, 2).join(", ") })}
                              </span>
                            )}
                          </div>
                          <span className="slot-time-badge">{t("estimatedMinutes", { minutes: slot.estimatedMinutes })}</span>
                        </div>
                        <GameCard game={slot.game} owners={slot.game.owners} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="draw-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={savingEvent}
                    onClick={() => void handleSaveAsEvent()}
                  >
                    {savingEvent ? t("savingEvent") : t("saveAsGroupEvent")}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={handleCopyLineup}
                  >
                    {copied ? t("copiedMenu") : t("copyMenu")}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || savingEvent || hasNoSelectedContributors}
                    onClick={() => void handlePlanLineup(true)}
                  >
                    {busy ? t("regenerating") : t("rerollLineup")}
                  </button>
                </div>
              </div>
            )
          ) : !singleResult ? (
            <div>
              <h2>{t("readySingleTitle")}</h2>
              <p>{t("readySingleDesc")}</p>
              <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
            </div>
          ) : singleResult.status === "empty" ? (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>{t("noSharedGamesTitle")}</h2>
                <p>{t("noSharedGamesDesc")}</p>
              </div>
            </div>
          ) : singleResult.status === "no_match" ? (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>{t("noSingleMatchTitle")}</h2>
                <p>{t("noSingleMatchDesc")}</p>
                {singleResult.unknownPlayerCount > 0 && (
                  <p className="draw-hint">
                    {t("unknownPlayerCountHint", { count: singleResult.unknownPlayerCount })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <span className="draw-result-intro">
                {t("singlePickIntro", { count: singleResult.eligibleCount })}
              </span>
              <h2>
                {t("letsPlay", { name: singleResult.game.name })}
                {singleResult.game.expansions && singleResult.game.expansions.length > 0 && (
                  <span className="draw-title-expansions">
                    {" + "}{singleResult.game.expansions.map((e) => cleanExpansionName(singleResult.game.name, e.name)).join(", ")}
                  </span>
                )}
                .
              </h2>
              <GameCard game={singleResult.game} owners={singleResult.game.owners} />
              <p className="draw-hint">
                {t("bringHint")}
              </p>
              <div className="draw-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy || hasNoSelectedContributors}
                  onClick={() => void handleSinglePick(true)}
                >
                  {busy ? t("picking") : t("pickAnother")}
                </button>
                {singleResult.onlyMatch && (
                  <span className="draw-hint">{t("onlyMatch")}</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
