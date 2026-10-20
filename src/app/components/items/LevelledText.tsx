"use client";
import { changedParts } from "@/shared/upgrade-view";

/**
 * A card line at a level, with the numbers the level moved picked out in colour — so dragging the
 * slider shows *what* it changed, not just that the card is different. `base` is the same line at
 * level 0; absent, the line is new at this level and is marked whole.
 */
export default function LevelledText({ base, line }: { base: string | undefined; line: string }) {
  const parts = changedParts(base, line);
  return (
    <>
      {parts.map((p, i) =>
        p.changed ? (
          <span key={i} className="lv-changed" title={base === undefined ? "Added at this level" : `Was: ${base}`}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
