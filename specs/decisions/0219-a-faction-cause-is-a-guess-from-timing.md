# 0219: A faction cause is a guess from timing

## Status

Accepted

## Context

[ADR 0218](./0218-a-faction-hit-is-parsed-not-only-watched.md) built a personal ledger of faction
hits — what raised or lowered a faction, and the net it comes to — but deliberately stopped short of
saying *why* a hit happened. The user asked directly for that next: "we need to see why these faction
hits/gains happened."

The game gives nothing to work with here. `"Your faction standing with X has been adjusted by -3."`
and its floor/ceiling wordings name no cause at all — unlike a kill line, which at least names its
victim. The only signal available anywhere in the log is **proximity**: a mob whose death matters to a
faction is followed, in the log, by whatever adjustment it produced. A quest turn-in presumably works
the same way, but this app has no parsed event for a turn-in at all — no dialogue-detection parser
exists to correlate against — so that half is out of reach today regardless of how causation gets
attributed.

This is a different kind of claim from every other parser in the app. `specs/log-watching/README.md`'s
whole discipline is that a parser reads a fact the log states outright, checked against a real
captured line first. Nothing here is stated by the game — a kill-then-faction-hit adjacency is a
plausible guess about how EQ Legends orders its own output, and nothing in hand (no real log showing
that exact sequence) has confirmed it. Building this as though it were a fact — silently folding a
guessed mob into a standing's `net`, say — would be exactly the "quietly wrong" failure mode
`data-provenance.ts`'s whole header exists to name, and ADR 0130's "data in doubt says so" rule exists
to prevent.

## Decision

Build the correlator as an explicit, visible **guess**, never as a fact, and keep it narrow: kill
proximity only, no quest-turn-in attribution (nothing to correlate against yet), no peer pooling (a
guess is not evidence worth sharing until it's been checked against a real log — pooling stays the
larger, separately-tracked follow-up ADR 0218 already deferred).

- **`src/shared/faction-cause.ts`** (new): a `note`/`resolve` pair modeled directly on
  `dot-attribution.ts` — stateless apart from the one most-recent kill it remembers. `noteKill(mob,
  at)` records a kill worth remembering; `resolve(event)` attaches a `FactionCause` (`{kind: "kill",
  mob, gapSec}`) when that kill landed within `CORRELATION_WINDOW_SEC` (3s) before the faction line,
  and hands the event back unchanged otherwise. Only a kill already gated by `combat.countsKill` (ADR
  0027 — a bystander's kill at a busy camp is not evidence) is ever noted, in both `main.ts`'s live
  path and `log-import.ts`'s replay, so a digested log attributes causes exactly as a watched one
  would have.
- **Types**: `FactionRecord` (`FactionEvent` + optional `causedBy`) replaces bare `FactionEvent` as
  what the ledger stores and the API hands over. `FactionStanding` gains `causes: FactionCauseTally[]`
  — a per-mob `{mob, net, hits}` rollup, biggest `|net|` first, folded the same way `net` itself is
  (and retained past the feed's cap for the same reason, ADR 0056).
- **UI**: a "Likely cause" column on Hits, a "Likely causes" column on Standings — both rendered dim,
  italic, prefixed `≈`, with a tooltip that states the uncertainty in words every time rather than
  once in a header nobody rereads. Never colored or weighted the way a real figure (Net, Raised) is.
- **Not attempted**: quest-turn-in causes (no parser to correlate against — real future work, same as
  ADR 0218 left it), and any pooling of a cause with peers (a guess isn't worth sharing until it's
  been checked).

## Consequences

- The Faction tab can now answer "why", for the one cause it has any signal for — a kill — without
  ever presenting that answer as more certain than it is.
- `CORRELATION_WINDOW_SEC` (3 seconds) is a starting number, not a measurement. The first real log
  that shows an actual kill-to-faction-hit gap should replace it, tighten it, or falsify the whole
  proximity assumption — whichever the evidence says, the same discipline `faction-watch.ts`'s
  `TRIGGER` was held to before ADR 0218 confirmed it.
- A hit with no kill in the window (a quest turn-in, or a kill just outside it) correctly shows no
  cause rather than a wrong guess dressed as one — the ledger would rather say nothing than lie.
- If a future pooled `FactionObservation` store is built (ADR 0218's remaining deferred half), this
  correlator is the natural first input to it — but it should be re-justified with real evidence at
  that point, not carried over as though the guess had already been proven.
