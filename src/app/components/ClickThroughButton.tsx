"use client";

/**
 * The 👻 click-through toggle used in window title bars: hand the window's clicks to the game
 * so you can fight through the glass, while the titlebar (and the rest of the chrome) stays
 * yours — including this button, which is what makes the mode escapable.
 *
 * Per window, like the ◐ opacity override: the map is the one you want to see through while
 * the list is the one you're clicking, and vice versa.
 */
export default function ClickThroughButton({
  on,
  what,
  onToggle,
}: {
  on: boolean;
  /** What passes the clicks through, for the hover ("the map", "the list"). */
  what: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={`wc no-drag ${on ? "on" : ""}`}
      title={
        on
          ? `Click-through: on — clicks over ${what} reach the game; this bar still works`
          : `Click-through: off — click for clicks over ${what} to reach the game`
      }
      onClick={onToggle}
    >
      👻
    </button>
  );
}
