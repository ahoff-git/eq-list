# 0358: A stone narrows the item it goes into, so sockets are judged together

## Status

Accepted

## Context

An exaltation moves one effect (focus at `+1`, click at `+2`, worn at `+3`, proc at `+4`) from one item into
another. eqlwiki's [Restrictions](https://eqlwiki.com/Exaltations#Restrictions) say the stone brings its source's
restrictions with it, and they are applied to the host: the classes that can use both are the ones that can use
the result, and a two-handed weapon's proc makes the host Primary-only. Their example is a Short Sword of the
Ykesha (WAR/PAL/RNG/SHD/BRD/ROG) taking Earthshaker's Earthquake (WAR/PAL/RNG/SHD, Primary): "Rogues and Bards can
no longer equip the sword".

`stoneFits`, the socket rule behind best in slot ([ADR 0310](./0310-best-in-slot-is-an-exact-assignment-by-your-weights.md)),
applied that to **one stone and one host**, and everything that used it asked the same question about the host's own
card: the loadout planner's socket claims and the Exaltations panel's options. A host has up to four sockets, so a build
puts several stones in it, and each one narrows it again. Checking each against the original card offered stones
that excluded one another.

Measured on the real catalogue for the wiki's own example host: 25 focus, 317 click, 25 worn and 308 proc stones
each fit the sword alone. Of the 7,700 focus + proc pairs, **1,714 (22%) cannot share it**, and with no class chosen
only **44%** of the 61 million one-stone-per-socket builds leave an item anyone can wear.

(Item search itself needed nothing: all four effect kinds are facets, parsed from the cards the same way. Across
9,423 cached item pages that is 163 focus, 104 worn, 376 proc and 907 click effects, 1,538 items in all, and no
effect-looking card line was missed. Ornamentation is not modelled; the wiki data for it is nearly absent.)

## Decision

**A stone is fitted to the host as the stones already in it have left it.** `withStone(host, stone)` is the host
with a stone in: the classes both allow and the slots both allow, or nothing when either is emptied. `stoneFits` is
now defined on it, unchanged for a single stone, and a second stone is asked about `withStone(host, first)`.

- **The planner** keeps what each host holds by socket: the stones already in it (read from the dump's sockets) and
  the ones this plan claims. Every later claim is fitted to the host as those leave it, ignoring the socket it would
  replace, since a replaced stone no longer narrows anything.
- **The Exaltations panel judges sockets together.** What narrows a socket's options is what is already decided: the
  stones in the host's other sockets and the effects you *wanted*. The socket whose best option is wanted is decided
  first, so what you asked for constrains the rest. A suggestion nobody asked for narrows nothing: it is one
  alternative among several, and letting the alphabetically first one constrain the others would hide pairings that
  work.
- **Each option says what it costs the host** (`narrowing`): the classes that can no longer use it and the slots it
  is confined to, in the wiki's terms ("not BRD ROG, Primary only").
- Order does not matter: an intersection is the same whichever stone goes in first.

## Consequences

- Two wanted effects whose stones exclude one another are not both planned into one host; the second is met another
  way or reported missing, rather than planned into an item nobody can wear.
- The panel's first option for each socket, together with what is held, is a build that can be worn. Alternatives
  are judged against the same commitments, not against each other, so choosing one can still rule out another.
- A stone that is *in* a socket and whose source item the catalogue doesn't know narrows nothing, since there is no
  card to read. That is the old behaviour, kept where there is no evidence to improve on it.
- Not modelled: that a host can only be given a stone at the grade that opens its socket costs copies (a `+4` is
  sixteen of the item), which the planner already weighs separately.
