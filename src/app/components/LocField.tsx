"use client";
import { useEffect, useState } from "react";
import { parsePastedLoc } from "@/shared/map/pins";
import type { Loc } from "@/shared/map/types";

/** How a `Loc` is shown back — whole EQ units, y first, the same order a paste is read in. */
function formatLoc(loc: Loc): string {
  return `${Math.round(loc.y)}, ${Math.round(loc.x)}`;
}

/**
 * A location, typed or pasted the way EQ states one — "5125, -1030", the same y-first order a
 * `/loc` line reports (`parsePastedLoc` also reads the whole line, so copying it verbatim works
 * too). Commits on blur or Enter rather than per keystroke, since a coordinate typed digit by
 * digit is garbage until the last one lands.
 *
 * `value` is the location this field currently stands for — a pin being relocated — and an edit
 * that doesn't parse snaps back to it. Leave it undefined for a bare compose box (the toolbar's
 * "paste a location" field): there's nothing to snap back to, so it just clears once accepted.
 */
export default function LocField({
  value,
  placeholder = "y, x",
  onCommit,
  className = "field sm",
  title,
}: {
  value?: Loc;
  placeholder?: string;
  onCommit: (loc: Loc) => void;
  className?: string;
  title?: string;
}) {
  const [text, setText] = useState(value ? formatLoc(value) : "");
  // Deliberately on the coordinates, not the `value` object: the caller's pin gets a fresh
  // reference on every unrelated edit (title, note, kind), and resyncing on those would blow
  // away a location this field is still mid-typing.
  useEffect(() => {
    if (value) setText(formatLoc(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.y, value?.x]);

  function submit() {
    const loc = parsePastedLoc(text);
    if (loc) {
      onCommit(loc);
      if (!value) setText("");
    } else {
      setText(value ? formatLoc(value) : "");
    }
  }

  return (
    <input
      className={className}
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(value ? formatLoc(value) : "");
      }}
      onBlur={submit}
    />
  );
}
