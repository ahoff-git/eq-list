"use client";
import { percent } from "@/shared/format";

/**
 * The ◐ "fully opaque" toggle used in window title bars: flip between 100% and the window's
 * saved opacity slider, for the moment you need to actually read what's behind the glass.
 *
 * Transient by design — it isn't saved, and each window holds its own (see `useWindowOpacity`),
 * so the map can go solid while the list stays translucent.
 */
export default function OpacityButton({
  opaque,
  opacity,
  onToggle,
}: {
  opaque: boolean;
  /** The saved value the toggle flips back to, for the hover. */
  opacity: number;
  onToggle: () => void;
}) {
  return (
    <button
      className={`wc no-drag ${opaque ? "on" : ""}`}
      title={
        opaque
          ? "Opacity: 100% — click for translucent"
          : `Opacity: ${percent(opacity)} — click for fully opaque`
      }
      onClick={onToggle}
    >
      ◐
    </button>
  );
}
