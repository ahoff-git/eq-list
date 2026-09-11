# 0229: A faction correction is a stated offset, not a replacement

## Status
Accepted

## Context
[ADR 0218](./0218-a-faction-hit-is-parsed-not-only-watched.md) built `faction-log.ts`'s ledger, and
every faction doc since has repeated the same caveat: `FactionStanding.net` is what this app has
*observed* change since it started watching this character's logs, never the character's lifetime
total — EQ's faction line states no starting point and no absolute value, ever
(`faction-unlock-progress.ts`'s header). A character who already had standing with a faction before
this app existed — race/class/deity modifiers, or simply having played before installing it — leaves
the ledger with no way to ever learn that gap on its own. The Race Unlocks progress bars
([ADR 0222](./0222-a-race-unlock-guide-is-generated-static-data.md)) make this sharpest: a bar reading
"40 / 2000" for a faction the player is actually most of the way to maxing reads as far less progress
than there really is, with nothing in the app able to say otherwise.

This is the same shape [ADR 0017](./0017-camp-efficiency-and-asking-the-player.md) already solved for
experience: "what the log can't say, the app asks for," with `AskValue` as the generic ask-once
control. A faction is not quite the same problem, though. XP's `intoLevel` is a single figure that the
player states once and the tracker then owns outright — every gain adds onto it, until a level-up
resets it to a known zero. A faction has **no level-up**: nothing ever hands the ledger a fresh, known
baseline, so a stated value can't simply become the new `net` — the ledger keeps folding in real hits
underneath whatever the player said, and those hits must go on affecting the total exactly as they
always did.

## Decision
**A correction is kept as an offset against the ledger's own net, applied on read, in a store that
knows nothing about the ledger's own history.**

- `electron/faction-corrections.ts` is its own small persisted file (`faction-corrections.json`),
  the same reasoning `xp-progress.ts` is one: it changes for a different reason (a player statement)
  than the ledger it adjusts (log lines). `set(faction, statedNet, observedNet)` stores
  `offset = statedNet - observedNet`, keyed by faction name — not the stated total itself, so that
  `net + offset` keeps reading true as new hits land, the way a corrected altimeter keeps reading true
  altitude after being set once at a known runway.
- `src/shared/faction-correction.ts`'s `applyFactionCorrections` is the pure merge: fold every stated
  correction's offset onto the matching `FactionStanding.net`, synthesizing a blank standing for a
  faction the ledger has no row for at all — covering exactly the history the ledger couldn't have
  seen is the whole point of a correction existing. A merged row carries `correction: { observedNet,
  correctedAt }` alongside the now-corrected `net`, so a reader can still say the figure is corrected
  rather than silently redefining what `net` has always meant — the same reason a guessed `cause` is
  never folded into `net` as though it were certain.
- The merge happens once, centrally, in the `faction:standings` IPC handler — `factionLog.ts` itself
  is untouched (a pinned black box; every scalar field on a hit is what `factionKey` dedupes by,
  ADR 0227's whole reason `editable: []` there), and every current and future reader of
  `faction.standings()` sees corrected numbers without needing to know corrections exist at all. The
  Faction tab's Standings table and the Race Unlocks bars are both this one channel, so stating a
  correction from either place updates both without any extra plumbing.
- **Offered every time, not just once**, unlike XP: a faction has no event that resets it to a known
  baseline, so `AskValue` sits on the Race Unlocks progress figure permanently, pre-filled with the
  current (already-corrected) total, rather than disappearing once answered.
- `useFactionStandings` gained a follow on `app.onDataChanged` (the existing "something changed in
  bulk" signal, already fired for an eaten log or a clear) so the UI refetches when a correction
  lands without a new hit ever arriving to trigger the feed's own refresh key.
- **`RaceUnlockAlerts` had to learn to tell a correction apart from a hit.** Its diff is meant to
  report only "this faction just moved" — but once standings refetch on any `dataChanged`, a stated
  correction can jump a watched faction's `net` by however far off the ledger's guess was, which would
  otherwise fire as a single alarming "±500" toast. It now diffs only when the feed's newest hit key
  actually changed; any other reason standings just re-read re-seeds its baseline silently, the same
  way the very first snapshot after mount already did.
- A correction is forgotten only by the explicit `"everything"` scope, never by a plain "forget
  records" — it is entirely the player's own statement, nothing folded from a hit, so there is no
  "records" half of it to discard (the same rule a retired standing gets, ADR 0056).

Rejected alternatives:
- **Storing the stated total directly, XP-style.** Works until the very next hit: nothing would then
  add that hit's delta anywhere, since the ledger keeps its own `net` moving underneath a value that
  no longer tracks it. An offset is the only shape that stays correct as both numbers keep changing.
- **Folding the correction into `faction-log.ts` itself.** That store is a pinned, tested black box
  whose own admin registration (ADR 0227) explicitly argues every scalar field on a hit *is* its dedupe
  key, so nothing is safely patchable there. A correction is not a hit and has no business inside it —
  keeping it a sibling file, merged on read, needed no change to that store or its tests at all.

## Consequences
- Every reader of `faction.standings()` — the Standings table, the Race Unlocks bars, any future
  consumer — sees a corrected `net` automatically; nothing has to ask for it specially.
- A `FactionStanding.correction` field exists for a UI to say a number is stated rather than purely
  observed, though only the Race Unlocks bar's `AskValue` control surfaces the *ability* to state one
  today — the Standings table shows the corrected number but doesn't yet offer its own control to set
  it, since the two views resolve to the same underlying correction either way.
- A correction never expires and never self-corrects the way XP's does at a level-up; restating it
  (typing a fresh value into the same control) is the only way to fix a wrong one, computed fresh
  against whatever the ledger's own net is at that moment.
