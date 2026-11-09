# 0375: A kill's coin and experience belong to the kill that follows

## Status

Accepted

## Context

`specs/todo.md` carried a lead, "not yet checked": this server writes a kill's coin before its "has been slain" line, so
anything that credits "the most recent kill" credits the one before. Checked against the real log (94 MB, 11,642 kills):
the order on this server is **faction lines, experience, coin, the corpse's dying words, then the kill — all in one
second.** 6,994 of 7,001 corpse-coin lines and 7,524 of 8,586 experience lines have a kill within 3 s *after* them; only
7 and 4 have one before.

Two ledgers read it backwards:

- **The kill ledger** (`kill-log.ts`'s `noteCoin`) guessed a corpse from what had already happened — the corpse just
  looted, else the newest kill in two minutes. Replayed over the real log, **27% of kills (2,498 of 9,144) carried the
  right coin**: 2,272 had none, 4,374 had another kill's.
- **The damage meter** (`combat-stats.ts`'s `recordXp`/`recordCoin`) credited "the most recent kill" within 15 s (XP) or 120 s
  (coin). 61% of experience gains had no kill in that window at all, so no mob was credited though the one that paid was
  3 s ahead; the Session tab's per-mob XP% was missing for most of them, and wrong by one kill where mobs differed.

Session *totals* were never wrong — only who earned them.

## Decision

- **A reward is the following kill's.** Both ledgers remember the coin and experience of the last few seconds
  (`COIN_LEADS_KILL_MS`, `GAIN_LEADS_KILL_MS`: 3 s) and where the backwards-looking rule put them. When a kill of yours
  is written, it **claims** those that led it: moves them from whichever kill they were filed under (or from nobody),
  once — a second kill in the same second doesn't take them again.
- **The backwards rule stays as the first guess**, so a log that writes the kill first still works and nothing waits to
  be shown; the claim is a correction, not a delay. A reward no kill follows (coin from looting an old corpse; quest
  experience) keeps the old answer.
- **Only your kills claim** — the meter's `countsKill` gate, the ledger's `mine` — so a stranger's death in the same
  second can't be paid your coin.

## Consequences

- Replayed over the same log, the kill ledger's per-kill coin is **right for 94%** (8,585 of 9,158), and the meter's
  per-mob XP and coin sum to the session totals exactly. What remains is coin from manually looting older corpses, which
  does not lead a kill and correctly stays where it was filed.
- A coin line that is genuinely followed within 3 s by an unrelated kill of yours — looting a corpse at the instant the
  next mob dies — is taken by that kill. On this server that is rare against 7 cases in 7,001 the other way.
- Stored ledgers keep the coin they were given. A re-read (`DATA_CONCERNS`) would fix history; none was asked for, so
  existing kills keep their old per-kill coin until one is.
- Faction hits have the matching same-second flaw in the other direction — 3,937 identical same-second hits (14% of
  28,656) collapse into one row because the key has no ordinal — and are **not** changed here: fixing it needs the
  replay-pass machinery kills and loot have, and would move standings players have already corrected.
