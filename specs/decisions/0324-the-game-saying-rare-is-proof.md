# 0324: The game calling a mob rare is proof it's worth timing

## Status

Accepted

## Context

The spawn board times only mobs it has proof are nameds, and its one proof is the article test
([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)): a kill written without
`a`/`an`, by a killer written without one either. That holds where a server writes its nameds bare
(`Fippy Darkpaw`, `Tranixx Darkpaw`). It fails wherever a rare is written like trash. Lower Guk's
`a ghoul cavalier`, `a ghoul scribe` and `a ghoul arch magus`, and Mistmoore's `an avenging caitiff`
and `a glyphed ghoul`, all read as ordinary kills, so nothing about them is learned or counted down.
On a real install that looked like the tracker had stopped working: the player moved from bare-named
camps to Guk in mid-October, the board stopped gaining rows, and the player started adding rares by
hand.

The game does say which mobs are rare. A consider tags one `- a rare creature -`.
[ADR 0269](./0269-a-pet-is-not-a-named-and-a-rare-creature-says-so.md) stripped the tag off the name
and set the evidence aside until it was measured. Measured on the same install's log (73 MB):

- 33 distinct names were tagged. 32 were never considered without the tag, so it reads as a property
  of the name, not of one spawn. The exception is `evil eye`, tagged once and untagged once: the
  wiki's Gorge roster lists `An Evil Eye (Beholder's Maze)`, a distinct rare sharing the common name.
- Fed to the tracker, the tags add 15 camps to the board, 11 of them with a respawn learned from kills
  already on file: ghoul cavalier and ghoul scribe each about 10 minutes over 9–10 gaps, imp familiar
  10 minutes over 9.

The wiki's `Category:Named Mobs` was the other candidate. It covers every Guk rare, but it also files
`zol ghoul knight` as named, a mob this player killed 69 times in four days. Its gaps would time
the player's kill speed, not a respawn.

## Decision

**A consider tagged `- a rare creature -` proves its mob is worth timing, the same way the article
test does.**

- `parseSighting` keeps the tag as `rare: true` on the sighting, still off the name.
- The tracker remembers each tagged mob in `spawn-timers.json` (`rare`, mob key → spelling), because
  a consider is not in the kill log and nothing could re-derive it. `isNamed` is the player's word if
  given, otherwise the article proof **or** a rare tag. A player's "not a named" still outranks both.
- `digestLog` passes the tag through, so eating an old log teaches the rares in it. The unattended
  re-read is not used: `spawn-timers.json` is re-stamped on every save, so a revision bump would
  usually be cleared before it could ask for anything.
- The wiki's Named Mobs list stays a map-pin source only.

## Consequences

- A rare written like trash is learned from all its kills on file and timed from its next kill once it
  has been considered once. A camper usually considers a rare before pulling it.
- A name shared by a rare and its common namesake (`evil eye`) lands on the board with a
  kill-speed "respawn". "Not a named" removes it. Keying by camp instead would need the respawn
  learner to take a place as well as a name, which is a lot of change for one known case.
- A rare never considered stays invisible, as it was before.
