# 0370: A stats read says who you are, and a bad one says what went wrong

## Status

Accepted

## Context

A stats grab ([ADR 0368](./0368-a-stats-grab-reads-the-inventory-window.md)) reads the figures on the Inventory
window's stats page, and [ADR 0369](./0369-a-stale-stats-read-says-so.md) says when they stop being true. Using it
on a real character (2026-11-08) raised three things, and the player asked for each: that a drag over the window
could take **the three classes** too, that the whole flow be **tested against the new data and its bad parses
handled**, and that the app **say what to do** ("need your stats page, press this").

**Who you are is on the window.** Its top-right corner prints the name, the level and the classes — `Kainos`, then
`31  WIZ/DRU/MAG` (`IW_Name`, `IW_Level`, `IW_Class`). Replayed through the recogniser on three real screenshots the
corner reads well, and fails in one way: the `/` between class codes comes back as an `I` in one preparation
(`WIZIDRUMAG`) and is dropped in the other (`WIZDRUMAG`) — every time. The planner meanwhile measures a read against
the classes ticked and the level on the Items tab (default 60), so a read taken as "no classes, level 60" bakes the
difference into every offset: on the real gear a read of a level-31 trio gave a mana offset of 2,640 that way and 873
measured as itself — the rest being the mana the classes' INT and WIS buy, which the plan can count once it knows them.

**The new data answers questions the app asked the player.** The Deaths page asks for max HP and for in-combat regen
per tick; both are on the page (a pool's max, the `HP Regen` row). The damage-taken table prices a resist on the
**gear's** points alone ([ADR 0361](./0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md):
"the only points known") when the read now holds the game's total — on the real character Fire is 9 points of gear and
19 in all, Magic 22 and 37.

**Bad parses, replayed.** The compiled reader was run on the real screenshots under the ways a drag goes wrong:
a sliver, the paperdoll, the corner alone, a black capture, the window shrunk to 75% and 60%, enlarged to 150%, and
JPEG-compressed. Lossless captures read 17 of 17. But a first pass that looked clean was **confidently wrong** at
60% (`SV. Cold 24` for 34) and under compression (`SV. Fire 11` for 19, the red row first) — and a wrong figure
applied quietly holds every later plan to it. Separately, a recogniser that fails (its model can't download) reached
the player as "there was no screen to read from", and a crop that found nothing said one thing for five different
mistakes.

## Decision

- **The corner is read as who you are** (`stats-identity.ts`). A number with a run of class codes right after it is a
  class line; the codes are a closed vocabulary (sixteen, three letters), so a run decodes one way or not at all, with
  the `/` skipped however it was read. A decode that matches the codes **letter for letter** is believed; one that needed
  a letter guessed, or two preparations that decode differently, is shown and **never applied**. The level is believed
  when a confident read says so (or two agree) and it is a level; the name when a confident word sits over it. Without
  the number beside the run it is not a class line at all — three letters that look like a code, alone, are not a class.
- **A read is measured as the character it says you are, and the pickers follow** (`stat-read-apply.ts`). The classes
  and level from the corner, the planner's own where it has none, are what the offsets are computed against — in one
  step from the read, not "set the pickers, wait for them to settle, then measure" — and the Class picker and level slider
  are moved to match (at the cap the slider means "no cap"). A read under a **different basis** than the calibration it
  lands on replaces that calibration rather than mixing two bases in one plan; one that applied nothing leaves what the
  player had. The panel — which owns the live pickers — tells the stale-stats pill the basis, so a read that moves them
  doesn't flash a "classes changed" reminder for the moment before they settle.
- **Another character's window is refused.** If the name read is not the character the app follows (the log file's),
  nothing is applied and the toast names whose it was — within one letter, since the recogniser misreads. An unreadable
  name, or no log, compares with no one.
- **Both preparations always run, and disagreement is doubt.** This reverses a choice in ADR 0368 (the second pass only
  when something was repaired): the second pass is the check on what the first read *confidently*. Two preparations that
  each read a stat believably and differ make it doubtful. **Four or more** stats in doubt says the capture is bad, and
  then every figure is doubtful and nothing is applied without a yes — the misreads that got through were tidy numbers.
- **A figure not trusted is asked about, not dropped.** What a read was unsure of is kept, and the stats block in the
  goals box lists it — "Not sure of Mana 2,924?" — with *Yes, use it* and *No, leave it out*. Yes applies it as the
  game's own, measured against the same basis.
- **A grab that found nothing says which kind of nothing.** From what the recogniser saw (word count, a sample, the crop's
  size): a **blank** capture (an exclusive-fullscreen game captures black), a box **too small**, the Inventory window
  with **no stats in view** (Equipment tab, scroll the panel), **another window** (with what it read instead), a capture
  **too rough to trust**, and a **recogniser that failed** (its model downloads once, so it needs the internet) — and a
  box that left out the corner says how to include it.
- **A read answers the Deaths page.** Max HP and HP Regen, when read sure, go to the figures the page asks the player to
  type (`hp.set`, `hp.setRegen`) — straight away, needing no dump. The three regen rows are read for it.
- **The damage-taken table is given the resists you have in all** — gear plus what the read says is beyond it
  (`withBaseResists`). With nothing read the base holds no resist and it is the gear alone, as before. This makes the
  table a second consumer of a read; the staleness reasons of ADR 0369 are about the offset, so they cover it unchanged.
- **The app says what to do** (`StatsSource`, in the goals box): *not read* → the two steps and the button; *read* → how
  old, and as whom; *stale* → why, and the two ways out; *waiting for a dump* → the command (`/outputfile inventory`);
  *unsure of a figure* → the confirmation. The key shown is the one the app actually holds: a hotkey another program
  owns is said to be taken and the button named, instead of promising a key that does nothing.

## Consequences

- A read is slower: two passes on every grab, a second or so more. It is made once per level, not per frame.
- A read measures as the corner says only when the drag **includes the corner**. A tight drag over the stats works as
  before, measured against the planner, and its notice says the corner would add the classes and level.
- The level on the page becomes the Items tab's level cap, so gear above the character's level leaves the planner's
  pool. That is what a levelling player wants and the slider moves it back; it is also what the rates are taken at, so
  floors are right for the character as it is — and the pill says so when the cap is moved off it later.
- The race is not on this page (it is on the Loadouts tab, as race levels), so it is still ticked by hand and a read
  taken before it nags once after it — [ADR 0369](./0369-a-stale-stats-read-says-so.md)'s open question about keeping
  figures rather than offsets would remove that.
- JPEG-compressed captures can still misread a digit in a way both preparations share (a `41` as `417` at quality 15).
  The app's own screen capture is lossless, so that is a stress test and not a use; the four-in-doubt rule catches most
  of what compression does, not all.
- Class codes the recogniser guesses are not applied, so a character whose corner reads `WlZ/DRU/MAG` still has to tick
  them — but the notice says what was seen, and the level can still be taken.
- Resolves the open questions on whether the grab should set the level and classes, whether a read HP should become the
  Deaths page's stated figure, and whether damage-taken should count the read's resists.
