"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface GuestRsvpModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  initialGuestNames: string[];
  onSave: (guestNames: string[]) => Promise<void>;
}

export function GuestRsvpModal({
  isOpen,
  onClose,
  eventTitle,
  initialGuestNames,
  onSave,
}: GuestRsvpModalProps) {
  const t = useTranslations("guestRsvp");
  const [guestNames, setGuestNames] = useState<string[]>(initialGuestNames);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGuestNames(initialGuestNames);
    setNameInput("");
  }, [initialGuestNames, isOpen]);

  if (!isOpen) return null;

  function handleAddGuest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    if (!guestNames.includes(trimmed)) {
      setGuestNames([...guestNames, trimmed]);
    }
    setNameInput("");
  }

  function handleRemoveGuest(index: number) {
    setGuestNames(guestNames.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(guestNames);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: "440px",
          width: "100%",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>{t("title")}</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>{eventTitle}</p>
          </div>
          <button type="button" className="button-quiet button-small" onClick={onClose} aria-label={t("cancel")}>
            ✕
          </button>
        </div>

        <form onSubmit={handleAddGuest} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input
            type="text"
            placeholder={t("inputPlaceholder")}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={60}
            autoFocus
            style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border)" }}
          />
          <button type="submit" className="button button-small" disabled={!nameInput.trim()}>
            {t("add")}
          </button>
        </form>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "8px" }}>
            {t("yourGuests", { count: guestNames.length })}
          </label>
          {guestNames.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--muted)", fontStyle: "italic", margin: "8px 0" }}>
              {t("noGuests")}
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {guestNames.map((name, idx) => (
                <span
                  key={idx}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: "16px",
                    padding: "4px 10px",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  👤 {name}
                  <button
                    type="button"
                    onClick={() => handleRemoveGuest(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: "0 2px",
                      fontSize: "14px",
                      lineHeight: 1,
                    }}
                    title={t("removeGuest")}
                    aria-label={t("removeGuest")}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </button>
          <button type="button" className="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
