# 0121: A mob is a range of levels, so its bounds widen

## Status

Accepted

## Context

The dataset this app is accumulating wants a mob's level, and the wiki already states one — on real
pages, as `Level: 33-37`, `Level: 9 - 11`, and `Level: 30`. Two of those three are ranges, which is
the fact the feature turns on: **"a gnoll pup" is not level 5.** The gnoll pups in that camp are
levels 4 to 6, and any single number is one of them rather than the answer.

That makes it unlike every other figure this app infers. `estimates.ts` was written for the shape
those share — an inferred number with one true value that evidence closes in on — and states five
rules for it, the first being *a bound only moves one way: evidence tightens it, nothing loosens it*.
Applied to a level, `tighten` produces a figure that looks completely reasonable and **excludes the
truth**: con a pup at 4, then at 6, and a tightening lower bound says "at least 6" about a mob you
have personally seen at 4.

The live source is the **consider** line, which the parser already reads for a different purpose:
`parseSighting` recognises the closed set of faction wordings as evidence a mob is up
([ADR 0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md)) and throws the rest of the line
away.

## Decision

**A level is a containment bound: evidence widens it.** Everything else about a mushy figure is
unchanged.

- **`widen(current, next, side)` in `estimates.ts`**, `tighten`'s mirror, with the distinction named
  in both: a **constraint** ("your maximum hit points are at least 640") has one true value and
  narrows inward; a **containment** ("this mob is level 12 to 17") has no single true value and
  opens outward, because a level you have seen is inside the range by definition.
- **`src/shared/levels.ts`** — `LevelRange {low, high, samples}`, `observeLevel` folding one reading
  in, `mergeLevels` pooling two observers', and `parseLevelClaim` reading the wiki's wording off a
  mob card (which is kept as free text by `parseMobCard`, so the page isn't parsed twice).
- **The rules that do carry over, unchanged, which is the argument for them being rules:**
  - an implausible reading is **discarded, never clamped** — a containment can no more recover from
    a bad value than a constraint can, so one bad level would widen the range for good. The
    plausible band is deliberately wide (1–200): it rejects a misparse, not a level cap this app has
    no business knowing.
  - the **sample count is part of the figure** — "level 12" from one consider and "12–17" from forty
    are different claims, and `levelWhy` words a single sighting as a sighting rather than a range.
  - **sources that disagree are reported, not resolved** — `levelsAgree` is *overlap*, not equality,
    because our range is built from however many considers happened to be typed and is nearly always
    narrower than the truth. Ranges that don't touch at all are the case worth flagging: that is a
    disagreement about which mob, patch or difficulty tier is being described, not a small sample.
- **Pooling a peer's range is safe in a way pooling their rate isn't**, and it's worth saying why:
  the worst a wrong range can do is make ours too wide, which reads as "we're not sure". It cannot
  produce a confident wrong number.

## Consequences

- `estimates.ts` gains the vocabulary for a second shape of mushy figure. Anything else that turns
  out to be a spread rather than a value — a respawn *window* as opposed to a timer, a damage range —
  now has the bound it needs and the reasoning beside it.
- The wiki's claim is readable today, and reconcilable against observation the moment observation
  exists.
- **The live source is not yet wired.** Reading a level off a consider needs the exact wording this
  server prints, and `parseSighting` deliberately **fails closed** on wordings it doesn't know
  ([ADR 0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md)) — a false sighting is
  permanent where a missed one costs a click. Guessing the format would be exactly the kind of
  invented rule that reasoning exists to prevent, so it waits on a real line. Tracked in
  [todo.md](../todo.md).
- Once it is wired, a level range is a natural thing to pool: it is a count and two bounds, merges
  by coverage, and rides the contribution machinery from
  [ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md) unchanged.
