"use client";

/**
 * The always-on-top 📌 toggle used in window title bars — grayed out when off, full
 * colour (the pushpin's own red) when on, so its state reads at a glance. The backing
 * state differs per window (a setting in the main window, local state in the map
 * window), so the parent supplies `pinned` + `onToggle`.
 */
export default function PinButton({
  pinned,
  onToggle,
  title,
}: {
  pinned: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      className={`wc pin ${pinned ? "on" : ""}`}
      title={title ?? `Keep on top: ${pinned ? "on" : "off"}`}
      onClick={onToggle}
    >
      📌
    </button>
  );
}
