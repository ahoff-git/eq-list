# 0153: A pet is not a named, a decoration is not a name, and a place remembers its own difficulty

## Status

Accepted

## Context

Five defects in spawn tracking, all found the same way: by replaying the player's real log — 372,004
lines, 4,179 kills, 189 zone lines, 683 sightings — through exactly the path `main.ts` runs, and
looking at what came out. None was visible from the unit tests, which all passed throughout; every
one of them is about what reaches the tracker rather than what the tracker does with it.

**1. A pet was tracked as a named.** `provenNamed` already refuses `<Owner>`s warder`, since the
possessive is proof of ownership. EQ writes an owned creature a second way and it carries no
punctuation at all: `Lord Sviir pet`, `Orc centurion pet`, `A fragile pet`. The log holds **34** such
deaths, and six of them reached the board as camps — `Sabertooth Clan Necromancer pet` with a learned
260-second respawn beside its owner's row.

**2. A decoration was read as part of the name.** EQ writes a consider as `<name> <regard> -- <how it
would go>`, and for a rare creature it inserts an annotation between the two:
`Kerran tiger spahi - a rare creature - glares at you threateningly -- ...`. `CONSIDER_RE`'s
`(?<target>.+?)` swallows it, so the sighting named `Kerran tiger spahi - a rare creature -`, which
matches no camp, and the observation was dropped. **34** lines, every one naming a mob worth timing —
`Minotaur Lord`, `Sabertooth Overseer`, `Refugee Splitpaw`. Of 683 sightings in the log, only **7**
ever reached a running timer.

**3 and 4. A difficulty change went unnoticed, twice over.** Each difficulty is its own instance
([ADR 0152](./0152-a-camp-arms-its-own-alert.md)), so arriving in a different one means every clock
for that place is counting from a death that instance never had. The rule compared the zone line
against `lastZone` — one variable, holding the zone seen immediately before. That failed two ways:

  - it started **empty**, so the first zone line after a restart had nothing to compare against and
    the repop went unseen — clocks survived a world that had been rebuilt under them;
  - and it held only the *immediately previous* zone, so any errand in between hid the change. On
    the real log: **52 changes caught, 11 missed** that way — `Blackburrow 2 (Adaptive)` →
    `Qeynos Hills` → `Blackburrow` among them.

**5. A row lied about a mob nobody had killed.** `untimedReason`
([ADR 0151](./0151-a-timer-can-be-built-from-a-kill.md)) explains why a camp has no figure, and its
last branch reads *"Killed once, so there's no gap to measure yet."* A camp added **by hand** for a
mob you have never killed — the whole point of being able to add one — has `samples: 0` too, and got
that sentence.

## Decision

**A pet is a pet however the log says so.** `isPetName` sits beside `isOwnedName` in
`combat-parser.ts` rather than replacing it, because the two answer different questions: that one
asks *"is this named as belonging to someone"*, which is what attribution wants and what
`buff-tracking.ts` reads; this asks *"is this a pet"*, which is what **classification** wants, and
the plain form names no owner for anything to attribute to. The suffix must be a whole final word, so
`a carpet` and `Pettr` are safe.

**A consider is stripped of the game's annotation before the name is taken.** `- a rare creature -`
is not the log's wording of the mob, it is the game's remark *about* it, and it can only ever appear
in that one position. A line that is nothing but the decoration names nothing and is refused, rather
than yielding an empty target.

The annotation is also, in passing, the game **stating outright that a mob is rare** — far better
evidence than the article test. Deliberately not acted on here: this ADR fixes a name being read
wrongly, and turning a consider into proof of namedness is a change to what lands on the board, which
wants its own decision and its own measurements.

**A place remembers what it was last called.** `lastZone` becomes `Record<placeKey, rawZone>`, and it
is **persisted**. The question is no longer *"what zone was I in a moment ago"* but *"what was this
place called the last time I stood in it"* — which is the question that was always meant, and answers
both failures at once: a restart reads the last reading off disk, and an errand elsewhere cannot
touch this place's entry. A place with no entry only ever *teaches*, since there is nothing for it to
disagree with, which is exactly right for a fresh install.

**A camp with no kills at all says so.** `untimedReason` asks `lastKillAt` first — absent means the
row was typed in and nothing has died under it yet.

## Consequences

Measured by replaying the same log against the fixed build:

| | before | after |
|---|---|---|
| camps on the board | 74 | **68** (the six pets gone) |
| sightings reaching a timer | 7 | **15** |
| repops that leave a stale clock up | 11+ | **0** |

Twelve regression tests, each pinning the defect rather than the fix: a pet under both spellings and
the owner still counting in its own right; a mob whose name merely ends in those letters; the rare
consider end to end, through the real parsers, as evidence and not merely as an end to the countdown;
the restart, the errand, the return to the difficulty you left, the first-ever zone line, and a
player's own timer surviving a repop that takes the mob clocks.

`noteZone` now calls `changed()` even when it drops nothing, because the reading it just took is part
of what is stored — a repop noticed but never written down is one that would be noticed all over
again next launch. That is one extra debounced write per zone line, which is nothing next to being
wrong about whether the world was rebuilt.

`samePlace` is no longer used by the tracker: comparing two *readings of one place* is `placeKey`
equality, and the looser filter was only ever needed because the previous zone might have been
somewhere else entirely.

The board is still mostly trash on this server — 68 rows, and `kerran tiger spahi` alone raised 127
banners over four weeks — because the log writes plenty of ordinary camp mobs without an article and
the article test believes it. That is [ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)'s
known cost and is not what any of these five were. The rare-creature annotation above is the obvious
lead on it, and now that the parser reads it, acting on it is a small change away.
