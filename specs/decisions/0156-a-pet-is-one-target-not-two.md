# 0156: A pet is one target, not two

## Status

Accepted

## Context

A buff on your pet is written two different ways by the two lines that matter:

    Kainos`s warder's skin sprouts thorns.        the landing — the pet, by name
    Your Shield of Barbs spell has worn off.      the fade — "your pet", naming nobody

`buffTarget` folded `You`/`your`/`yourself` to `ON_YOU` and passed everything else through, so the
first became an instance keyed on `Kainos`s warder` and the second on `ON_PET`. Two `instanceKey`s
for one buff, and the consequences ran in both directions at once:

- **The rise never came down.** `Shield of Barbs on Kainos`s warder` sat in *Up now* from 15 August
  to the end of the log.
- **The fade arrived as an orphan.** `Shield of Barbs on your pet` was filed as a fresh lapse with
  `since` equal to its own end, so it read as held for zero seconds.
- **Both at once.** The same buff appeared in *Up now* and in the standing "you are missing this"
  list, disagreeing with itself on one screen.

Measured on a real log: 17 rows of *Up now* were pet buffs that had already worn off.

The same gap swallowed the player's own name. The log writes you as `You` when you act but by
character name when a message names you, and only the first was folded.

## Decision

**`buffTarget` folds your own name and your own pet**, given the character whose log this is.

- `player` is a dep on the tracker, asked as a function rather than captured: switching the watched
  log switches whose pet `Kainos`s warder` is.
- The fold reuses `isYours` and `isOwnedName` — the same two questions the damage meter and the kill
  log ask about ownership, rather than a fourth opinion about what a pet looks like.
- **Blank means fold nothing.** Without a name, `Bloop`s warder` and `Kainos`s warder` are the same
  shape, and merging a group-mate's pet into yours would be a lie. Two rows about one pet is a wart;
  one row about two pets is wrong.

## Consequences

A buff on your pet goes up and comes down under one identity, so *Up now* empties as it should and
the standing list stops carrying a duplicate of it.

**It needs the character name, which the app already knew** — `characterFromLogFile` — but the buff
tracker did not have. That is now a dep like the others, injected, so the tracker still owns no I/O.

**A group-mate's pet stays a name.** It gets its own row, which is correct: their pet's buffs are
not yours to keep up, and nothing here pretends to know whose warder it is beyond what the log says.
