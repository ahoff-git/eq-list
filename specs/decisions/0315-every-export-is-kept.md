# 0315: Every export is kept

## Status
Accepted

## Context
EverQuest writes each `/outputfile` dump to one file per character and type
(`<Character>_<server>-<Type>.txt`) and overwrites it on every run. So each new export destroys the
last one: a bank seen at the banker is gone once you dump in the field, and last week's faction
standings are gone once you dump today. [ADR 0308](./0308-the-game-s-faction-dump-is-a-stated-total.md)
and the inventory carry-forward (`carryForward`, `readInventory`) already keep the parts the app
relies on. The player's instruction (2026-10-20) is broader: preserve the data from all of the
exports; there's no need to delete any.

## Decision
- **Every dump the followed character has is copied** to
  `<userData>/export-archive/<Character>_<server>/<type>/<when written>-<hash>.txt`. This covers every
  type: inventory, factions, achievements, spellbook, recipes and the rest.
- **Copies are only ever added.** Nothing in the archive is deleted or overwritten by the app, and it
  survives the game's own file being removed.
- **An identical rewrite isn't stored twice.** Copies are identified by a hash of their content, so
  archiving on every poll costs a read and a hash.
- Archiving runs at startup and every 30 seconds in the main process (`startExportArchive`), so a dump
  is kept even if the Exports tab is never opened.

## Consequences
- Any past export can be recovered, or read later by a feature that wants history (inventory over
  time, faction progress between dumps), without asking the player to have kept files themselves.
- The archive only grows. Dumps are tens of KB, so a dump a day is a few MB a year. If that ever
  matters, pruning would be a new decision, not a default.
- The archive is per character, keyed the same way the dumps are, so alts' exports stay apart.
