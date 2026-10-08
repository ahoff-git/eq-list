"use client";
import { percent } from "@/shared/format";

/**
 * The ◐ "fully opaque" toggle used in window title bars: flip between 100% and the saved opacity
 * slider, for the moment you need to actually read what's on the glass rather than behind it.
 *
 * Transient by design, and **per window** even though the saved value is shared (see
 * `useWindowOpacity`) — leaning into the map shouldn't clear the list too.
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
