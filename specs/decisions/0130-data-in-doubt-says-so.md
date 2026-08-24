# 0130: Data in doubt says so, and so does everything computed from it

## Status
Accepted

## Context
[ADR 0127](./0127-an-unknown-name-is-held-not-dropped.md) settled that an unplaceable name should be
held rather than dropped. This is the half that makes the holding *visible* — and it turned out to be
the cheap half, for a reason worth recording.

The meter already keys its rows and cells by **name** and asks `isMine` at `summarize` time. That is
read-time attribution, and it means a fight summarized after a proof is already right. What was
missing was not machinery to hold the data — the data was held — but any way for a figure to say **"I
was computed while something about me was unknown."** Without that, a provisional number is
indistinguishable from a settled one, which is the quiet kind of wrong: the reader has no way to tell
that `yourDealt` on this fight might move.

**What counts as placed** is stated once, from what the log actually says:

- **you**, or anything of yours (`isMine`, including a proven pet);
- a **group-mate**, or theirs (`party`);
- anything carrying an **article** — that is how the game writes a creature ("a coyote");
- anything **your side has traded blows with**, which is what covers a named creature with no article.

What is left is a bare name nobody has placed: it could be your pet, a group-mate, or a stranger, and
ADR 0077 is right that guessing between them from the shape of a name is not on. So it is said.

**Measured on the real 315,601-line log**, and this is what decides whether the flag is signal or
wallpaper: **287 of 1,433 fights (20%)** carry doubt, over **73 distinct names**, accounting for
**18.4%** of recorded damage. The names it names are genuinely ambiguous, which is the test that
matters:

- `Bunnyslayer` (×134) — a real group-mate, whose party line appears in *one* of 22 sittings. In the
  other 21 the app genuinely does not know they are grouped with you.
- `Kabab`, `Kiber`, `Kabartik`, `Gobekab` — other players' summoned pets, named by the same generator
  as yours and unplaceable by construction.
- `Vobtik` (×5) — one of *your* pets, in the fights before its own proof arrived.
- `Royal guard` (×10) — a named NPC with no article that you never swung at.

Not one of those is a false positive, and 20% is frequent enough to be worth knowing and rare enough
to still read as a warning.

## Decision
**A window records the names it tallied that nothing had placed, held apart from the tallies, and
every figure derived from it carries that doubt forward until the log settles it.**

Three parts, and the third is the one that makes it worth anything:

1. **Held separately.** The doubt is a set beside the tallies, not a flag mixed into them. The
   figures are real and belong where they are; what is uncertain is only *whose* they are.
2. **Resolved on read.** Whether a name is still in question is asked when the window is
   summarized, so a pet proven or a group-mate learned in the meantime simply isn't in the answer.
3. **Propagated.** A fight's doubt reaches the sitting, the camp, and any personal best taken off
   it. A sum of a doubtful figure is a doubtful figure.

## Consequences
- **`FightStats.unsettled?: string[]`** — the names, not a boolean, because "provisional" is much
  easier to act on when it says *who*. Computed on read from the window's own `doubted` set.
- **It clears itself.** Two things can settle a name — a pet proven, a group-mate learned — and both
  are asked at summarize time, so no invalidation, no re-computation, and no state to get stale. The
  tests pin exactly that: prove the pet and the fight's doubt lifts with the pet's damage moving into
  `yourDealt`, without the fight being read again.
- **Propagated** to `SessionSummary.unsettled`, `ZoneReport.unsettled`, `ScoreCandidate.unsettled` and
  `HighScore.unsettled`. A record is stamped from the fight that produced it rather than re-derived,
  because only that fight knows whether whose the damage was had been settled.
- **Shown where a person looks**: a `?` on the fight row and the sitting header in History, and on a
  provisional record in the scoreboard. Deliberately a different mark from ADR 0128's `⚑`, which says
  something else entirely — `⚑` is "this can no longer be put right", `?` is "this will put itself
  right". One is a dead end and one is a pending answer.
- **Both marks are transient by design.** Re-reading the log applies whatever the log has since
  settled (ADR 0128), and a release can now do that itself
  ([ADR 0129](./0129-a-release-can-ask-for-a-re-read.md)) — so the ordinary life of a `?` is to
  disappear without anybody doing anything.
- **Still outstanding, and unchanged by this**: the record-time attribution bakes ADR 0127 step 2
  names — the sparkline, the per-spell table, the per-invocation procs, the death-recap buffer. Those
  are why a proven pet's damage shows on its row and in the drill-down and is missing from the Spells
  tab. This decision makes the doubt *visible*; it does not make those seven places read-time. Held in
  [todo.md](../todo.md).
- **A doubtful figure is still counted, not withheld.** The alternative — leave it out until settled —
  was rejected for the reason ADR 0127 gives about dropping: understating is not more honest than
  saying "this much, and here is what is unresolved about it".
