# 0093: A high score is a personal best, per character, with a floor

## Status

Accepted

## Context

The damage meter answers "how is this pull going" ([ADR 0053](./0053-damage-is-cells-rolled-up.md)),
and the fight history answers "how did last week go"
([ADR 0021](./0021-stored-fights-keep-their-source.md)). Neither answers the question people
actually remember an evening by: **what is the best I have ever done.** `combat-stats.ts` keeps only
"this fight" and "this session" on purpose, and `combat-history.ts` keeps the last thousand fights —
which is a list, not a bar to clear. The one thing in the app that came close was `bests()`, and it
is deliberately narrower: *your best DPS against a given opponent*, for the ★ on the meter.

The ask is a scoreboard — biggest hit, biggest heal, biggest crush, most damage survived — where
beating one is worth being told about. That makes it a **notification feature** as much as a data
feature, and every hard question here turned out to be about the notification rather than the
arithmetic: "did this beat the record" is a comparison, and "is this worth interrupting someone
mid-fight for" is not.

Four situations make the naive version — record every maximum, banner every improvement — worse than
nothing:

1. **An empty board makes everything a record.** A brand-new board would fire eight banners during
   your first fight, which teaches you to ignore them permanently.
2. **The log is replayed at launch.** [ADR 0044](./0044-the-log-position-outlives-the-app.md) feeds
   everything logged while the app was shut through the live path, and
   [the importer](../../electron/log-import.ts) does the same for a log you deliberately eat. Those
   records are real; a banner for a hit you landed last Tuesday is a lie about the present.
3. **The first sample owns a rate forever.** Your first fight is your best DPS, your longest fight
   and your richest fight; a two-second swipe at a rat is a perfectly good "fastest" anything.
4. **A running counter beats itself every tick.** A kill streak takes the record on one kill and then
   beats it again on every kill after, so the naive rule chants at you for an hour.

There is also a scope question the app has an established answer to: a level 50's biggest hit is not
a bar a fresh alt should be measured against.

## Decision

A **scoreboard** of personal bests, in [src/shared/high-scores.ts](../../src/shared/high-scores.ts)
(the categories and every comparison, pure) and
[electron/high-scores.ts](../../electron/high-scores.ts) (the board, which needs memory). Six rules:

- **A board belongs to a character.** The log file names them, as it already does for the meter's
  own rows, the HP estimate and the kill log. Every character's board lives in the one file keyed by
  name, so switching back finds yours intact — and a fight is attributed by *its own* log file, so
  eating someone else's log can never credit their evening to your board.
- **Every category carries a floor**, stated beside the category rather than at the call site. A
  candidate under it is not a score. This is what makes a record mean "this was good" instead of
  "this was first" (situation 3).
- **The first score in a category sets the bar, silently.** A score with nothing to beat is not
  news. `previous` being absent is how the board says so afterwards, and the panel shows it as *set
  the bar* rather than as a gain (situation 1).
- **Old news is filed, never announced.** The keeper is muted until the watcher reports caught up,
  and history read in from disk is silent unconditionally (situation 2).
- **A running counter announces the crossing, then keeps climbing quietly** (situation 4). The flag
  that governs it turns on when a claim **spoke**, not when it took the record — a streak whose
  first record was the silent bar-setting must still get its crossing announced.
- **A fight is read for the per-hit records inside it, not just its own totals.** One function does
  both, which means a board can be **seeded from the fights already on disk** rather than starting
  empty — so the first live record has something real to clear. A tie never beats, so the coarse
  re-reading can't displace the precise live candidate that already recorded the same hit.

Two **families** rather than fixed rows: a category per melee skill (`melee:Crush`) and per hit
qualifier the log writes (`qual:Crippling Blow`). No character slashes, crushes, pierces, kicks,
bashes *and* backstabs, and a fixed list of qualifiers would be a guess at what this server tags a
hit with. The board grows a row the first time you land one; `Backstab` appearing on it is itself
information.

The celebration **reuses the cast-alert overlay**: `CastAlertEvent` gains `event: "record"` and
carries the score. Position, colour, animation, duration, beep, the click-through window and the
per-display choice are all solved there and all tunable, and a second overlay would be a second set
of the same settings. It follows from this that celebrations require alerts to be on — necessary but
not sufficient — and the scoreboard says so rather than going quiet.

A celebration wears a **saved style or the alert defaults, and never a look of its own**. [ADR
0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md) settled that a look is a shared, named
thing edited in one place and [ADR 0090](./0090-one-style-editor-at-a-time.md) that there is one
editor for it; a style editor on the scoreboard would be exactly the third source of truth those
two exist to prevent.

The score travels **raw** in the payload rather than pre-worded, which is the one way it differs from
every other alert. A watch's wording has to be resolved in main because the overlay never sees the
watch — but the score *catalog* is shared code, so the overlay names and formats the category itself.

Two accessors are added to the combat tracker, both read-only and both naming something it already
knew: `mine(name)` (you or anything of yours, pets included) and `countsKill(mob)` (the gate
`recordKill` already applied, now stated once and asked twice). The alternative was a second copy of
pet ownership and fight scope inside the scoreboard, which would eventually have disagreed with the
meter about the same corpse.

**Not built: fastest kill.** It reads like the obvious category and it is meaningless across mobs —
the record would permanently be whatever the weakest thing you ever swung at was. Per mob it is
`bests()`'s question, not this one.

## Consequences

A new record is a banner over the game and a row on **Damage → 🏆 Records**, grouped, with what it
was against, when, where, and what it beat by. The board is per character and seeded from your
recorded fights, so it is populated the first time you open it rather than being a page of blanks.

Three categories can only be filled from live play — biggest DoT tick, biggest heal, and every
`qual:` family row — because a stored fight keeps a *count* of criticals and ticks and a healing
*total*, never the biggest one. The panel names the missing ones on a seeded board, so an empty row
reads as honest rather than as a fault.

A genuinely great fight can beat several fight-level records at once (damage, DPS, kills, XP, coin),
and each gets its own banner. Accepted rather than merged: the overlay already caps a stack at four,
and dropping the celebration for a real record is worse than a fourth banner.

The scoreboard is fed **after** the meter, the HP estimate and the alert router, so nothing that
must not wait is ever behind it — the same ordering rule
[alert-router.ts](../../electron/alert-router.ts) states for alerts, applied to the one other thing
in the app that puts a banner up off its own bat.

`Settings.highScores` is new (`celebrate`, `styleId`), defaulting to on: the board fills itself in
either way, and a record you weren't told about is one you find by going looking.

Records are kept in `high-scores.json` and survive a clear of the fight history — they are a
different claim from the fights that produced them, and clearing a board does **not** re-seed itself
from history, because "forget my records" plainly doesn't mean "put most of them straight back".
