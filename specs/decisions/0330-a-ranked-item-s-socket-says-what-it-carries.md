# 0330: A ranked item's socket says what it carries, and anything socketed can move

## Status

Accepted

## Context

The loadout builder treated a held item as carrying the effects on its wiki card, and found stones in
two places only: loose stones, and an unworn item's own effect once ranked up. The
[Exaltations](https://eqlwiki.com/Exaltations) rules say more. Once an item reaches a socket's grade
(focus +1, click +2, worn +3, proc +4), its own effect of that kind becomes a removable exaltation in
that socket. It can be taken out and put into another item, and anything socketed can be taken out
again ("you can always move it back").

The inventory dump records this. A real dump, read against the catalogue:

- 11 ranked items list their own effect in its socket (`Golden Ear Stud +3` → focus: `Golden Ear
  Stud (Exaltation)`).
- 2 hold another item's stone there instead (`Gatorscale Sleeves +3` → focus: `Azure Sleeves`).
- 1 has had its own moved out: `Mistmoore Heirloom Ring +3` shows no worn stone, because it's in
  `Ring of Xorbb +4`'s worn socket.
- Storage rows carry no sockets at all, so the dump can't say for those.

Reading the card instead, the builder counted a Staff of the Wheel +4's original focus as still worn
when an Idol of the Underking stone had replaced it. It never offered a stone sitting in an item you
won't wear, and it never noticed a wanted effect already socketed into a planned item.

## Decision

**For a held item outside Storage, a ranked kind's socket is the truth about that kind of effect.**
It holds the item's own effect, another item's stone, or nothing. An unranked kind, and every kind
for an item in Storage, is read from the card.

- **Carrying.** A held copy carries what it really has now (`heldEffects`). A catalogue item to hunt
  carries its card. This decides whether a planned item already meets a wanted effect, and which held
  items can carry one if worn.
- **Stones** come from three places. Loose ones anywhere. Any stone socketed into something the
  loadout won't wear, its own or another item's. And, for Storage items where sockets are unknown, an
  own effect once the item is ranked to it.
- A stone taken from another item's socket leaves that host wearable. An item's own effect, once
  extracted, keeps that copy out of the loadout as before.
- **A stone can go into any item with that socket open,** whatever is in the socket now (it's taken
  out first). So a wanted effect is met in whichever of three ways keeps the most stats:
  - socket it into something the loadout already wears (free);
  - wear something that carries it;
  - wear something with the socket open and move the stone in.
  The last two are weighed against each other: on the real dump, Extended Range II's stone moves into
  the Ring of Xorbb +4 instead of the weaker ring it sits in being forced on. The only limit is the
  socket: a ring needs +1 for a focus socket, so a +0 ring to hunt can take one only at a hunt grade
  of +1 or more.

## Consequences

- On the real dump, Mana Preservation II is now recognised as already worn, via a stone in the
  Talisman of Kejaar Kerrath +9, where before the builder forced another item on for it.
- If a future dump format lists Storage sockets, Storage items get the same reading by changing the
  one area check in `heldEffects`.
