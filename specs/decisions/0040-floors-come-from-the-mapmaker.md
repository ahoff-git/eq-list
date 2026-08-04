# 0040: Floors come from the mapmaker's labels, not from the geometry

## Status

Accepted

## Context

Drawing the game's own maps ([ADR 0039](./0039-render-the-game-s-own-maps.md)) gave every
multi-storey zone a new problem: one file holds *every* floor, so RunnyEye Citadel arrives as
five levels of corridor superimposed. That is what the game draws, and it's unreadable.

It also undid something. [ADR 0037](./0037-one-zone-many-layers.md) gave layered zones a
picker whose choice pins and pings are stamped with — but that was built on RunnyEye being
four separate *image files*. With one vector file there's nothing to pick, so switching to the
better maps cost the layer feature.

Every segment carries a z, and `LocEvent` already parses the player's, so the obvious answer
was to cluster heights into floors. Checking that against the real files killed it. Histograms
of segment heights are multi-modal for reasons that have nothing to do with storeys: Greater
Faydark's terrain plus Kelethin's tree platforms would split a one-floor zone into several,
and Najena's would too. Worse, the floors that *are* real aren't cleanly separated — RunnyEye's
bands are joined by the stairs between them, so there are no empty gaps to cut at.

Then the files turned out to already know the answer. RunnyEye's own labels read
`Level 1 (Top)`, `Level 2`, … `Level 5 (Bottom)`; Unrest's read `1st Floor` … `4th Floor`.
The mapmakers wrote the storeys down.

## Decision

**A map's floors are the ones its author labelled.** `detectFloors` reads points of interest
whose label is *only* a floor designation, groups them by number (several markers of one level
average out), and orders them by height. A map that doesn't name its levels has no floors,
which is the honest answer and leaves every outdoor zone alone.

Three rules earn their place, each from a real file:

- **Anchored matching.** `Level 2` and `1st Floor` name a storey; `Water - LVL 3`,
  `Bridge - LVL 2` and `TRAP: Fake Floor` merely mention one — they're features standing on a
  floor. Matching the whole label excludes them without a blocklist.
- **Height decides the order, not the number.** A dungeon counts `Level 1` downward from the
  top; a keep counts `1st Floor` upward from the bottom. Sorting by z lists both top-down.
- **Labels must be separated in height to be storeys.** Kurn's Tower labels all eight floors
  at `z=1` — it's drawn as eight plans side by side, not stacked. Banding by height there
  would leave every floor empty, so a map whose labels sit closer than `MIN_FLOOR_GAP` is
  drawn whole.

Each floor owns the heights nearer its own label than its neighbour's, and the outermost reach
to infinity, so no geometry belongs to nothing. A **stair shows on both floors it touches** —
a segment is on a floor if either end is.

**Showing every floor at once stays the default**, matching the game. Picking one filters the
geometry and the labels, and is stamped onto pins and pings through the same `layer` field
ADR 0037 established — so the *concept* is shared even though a floor and a separate map file
are found differently. `onLayer` grows a third case: a marker with no layer belongs to the
zone, a view of `null` is showing everything, `undefined` is a zone with no layers at all.
And because the player's `/loc` carries a height, the picker marks the floor you're standing
on with **· you** — surfacing what we know without hiding anything on a guess.

## Consequences

Four of Brewall's 568 zones name their floors (RunnyEye, Unrest, the Tower of Frozen Shadow,
and a ship), and none of the game's own 133 do. That's a narrow feature — and it covers the
zone that prompted the layer work in the first place, while provably inventing floors nowhere:
no outdoor zone gains one, and Kurn's Tower is correctly left whole.

Verified by rendering RunnyEye's five floors side by side: each is a legible plan instead of a
tangle, with segments distributing 222 / 553 / 420 / 1007 / 57 across them (summing above the
2,237 total, which is the stairs counted on both sides, as intended).

The narrowness is a property of the *data*, not the design — a pack that labels more zones
gets more floors for free, and so would a user who adds a `Level 2` marker to a map by hand.
What this doesn't do is infer a floor from the player's height alone: if a map is silent, we
say nothing rather than banding heights we don't understand.
