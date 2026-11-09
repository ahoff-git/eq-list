# 0376: Identical faction hits in one second are each a hit

## Status

Accepted

## Context

A faction hit was keyed by its signature: the logged second, the faction, the direction and the amount — "the same
trade loot's own key makes" ([ADR 0033](./0033-eating-a-log-is-idempotent.md)). Two mobs dying together each give
"Storm Guard raised 5", and those two hits have the same signature, so the second was filed as "known" and dropped.

Loot and kills had already outgrown that trade: both key by signature **plus an ordinal**, and count repeats against a
per-replay pass so that reading a log twice still adds nothing. Faction never did. Measured on the real log (94 MB),
**3,937 of 28,656 faction lines — 14%, in 526 groups — were genuine hits the ledger refused to hold.** A standing built
from that ledger is short by exactly those hits, and so is every "caused by" tally and race-unlock progress.

[ADR 0375](./0375-a-kills-coin-and-experience-belong-to-the-kill-that-follows.md) found this and left it, on the grounds
that it needed the replay machinery and a decision about standings a player has already corrected. This is that work.

## Decision

- **A faction hit's key is its signature plus an ordinal.** The first hit with a signature keeps the bare signature as its
  key, so every row stored before this existed is still exactly its own key and nothing is migrated; the next is
  `<signature>#1`, and so on.
- **`add` counts repeats the way loot does.** Live, every line is new: the next ordinal. In a replay (`startReplay`,
  called by `importLog` beside the kill and loot ledgers) the Kth identical line this pass is new only once fewer than K
  are already on record. Eating a log twice, or once live and once later, adds nothing the second time.
- **The count is a range read on the primary key** (`key = base OR key >= base# AND key < base$`), not a `LIKE`, so a
  faction name with a wildcard in it, or an amount that is a prefix of another (5 and 50), can't be miscounted.
- **History is not rewritten.** A ledger from before this keeps the hits it has; a re-read adds the ones it dropped. No
  data revision is bumped, so nothing re-reads on its own.

## Consequences

- Replayed over the real log, the ledger holds **all 28,792 hits** (24,719 before), and a second pass adds none.
- A standing grows by the hits that were missing, once a log is re-read. A **correction** stated before then
  ([ADR 0229](./0229-a-faction-correction-is-a-stated-offset.md)) is an offset against the net *at the time*, so it
  stays true of the moment it was stated and drifts by the recovered hits afterwards — the cost of making history
  right, and the reason no re-read is forced.
- Live behaviour is unchanged for everything except same-second repeats, which now count.
- A hit read live and then again by an import of the same file is recognised only because the import calls
  `startReplay`. A caller that feeds old lines to `add` without it would count them again — the same contract kills and
  loot already have.
