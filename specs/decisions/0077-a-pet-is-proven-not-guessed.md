# 0077: A pet is proven, not guessed

## Status

Accepted

## Context

The parser reads ownership off the log's possessive form — `Kainos`s warder`, with a backtick —
and `isYours` / `isTheirs` in `combat-parser.ts` are built on it. The comment there said it was
"the only ownership the log ever states", and for a pet whose name contains its owner's, it is.

A pet with **its own name** breaks that. `Garn hits a coyote for 12 points of damage.` is written
exactly like a player hitting a coyote; nothing in the line says whose Garn is, or that Garn is a
pet. The consequence was worse than a miscredit: with neither side of the exchange recognised as
ours, [ADR 0067](./0067-the-meter-counts-your-party-s-fights.md)'s scope reads the whole thing as
somebody else's fight and **drops it**. A named pet's damage went missing, not onto the wrong row —
and silently, since a meter that is merely lower than it should be looks like a quiet evening.

The tempting fix is to guess from the shape of a name: a bare single-token attacker, in a fight
you're already in, is probably your pet. It is also *exactly* what a group-mate looks like
(`Galactic hits a coyote`), so the guess converts party members into pets and inflates your own
damage with theirs — the opposite error, and a flattering one, which is the worst kind to ship.
A neighbour hit this and left a comment about it (`eql-meter`, see [neighbours.md](../neighbours.md)).

There is a line that settles it. When a pet confirms an attack order —

    Garn told you, 'Attacking a coyote Master.'

— the game addresses it to that pet's **owner and to nobody else**. You cannot see another
player's pet confirm orders. A line reaching your log is the game stating the relationship.

## Decision

**Learn a pet only from its own attack confirmation, and never from the shape of a name.**

- The tell parses to a `pet-engage` combat event carrying the pet's name and its target.
- A `pet-registry.ts` black box holds the names. An entry means "mine": the tell only ever
  arrives for your own pet, so there is no owner field, and none to get wrong.
- The registry joins `isYours` in deciding what counts as yours, so the pet's damage, its
  incoming damage and its row all land where they belong.
- The engage **also names an enemy**, on the same "our side swung at it" grounds a swing would.
  That's what lets a pet sent in ahead of you open the fight rather than having its first hit
  dropped for want of anything establishing the target as hostile.
- The registry survives `reset()` and is cleared on a **character change**. A pet only announces
  itself when you *order* it onto something, so forgetting one mid-fight would silently stop
  counting the rest of that fight's pet damage — while a stale pet under a new character would
  credit a stranger's damage to you.

## Consequences

- A group-mate's **named** pet stays invisible as a pet. The tell never reaches us, so we have no
  evidence, and the honest answer is the one we can defend. Their damage still counts toward the
  fight (they're on your side by the roster); it simply isn't attributed as a pet.
- A pet that never receives an explicit attack order — one that engages on its own, or was
  already fighting when the app started — is not learned until the next order. That is the price
  of refusing to guess, and it fails in the safe direction: damage missing, never damage invented.
- The possessive path is unchanged and still carries the common case, so nothing about warders
  moves. The two signals are independent and either is sufficient.
- Ownership is now knowledge the meter accumulates rather than a pure function of a name, which
  is why it lives in a registry beside `party.ts` rather than in `combat-parser.ts`.
