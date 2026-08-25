# 0138: A replayed log narrows what a kill proves, and how long a sighting holds a row

## Status

Accepted

## Context

[ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) reads named-ness off the
article, and knew that half a signal wasn't enough: `Bunnyslayer has been slain by a froglok shaman!`
is written exactly like a named dying, so the **killer's** article was added as the other half —
"a person kills a named, a mob kills a player or a pet". It says outright that this was found by
replaying an evening rather than by reasoning.

Replaying more evenings finds the hole in it. **A named killing your pet or your group-mate fits the
rule exactly**, because a named has no article either:

    Kainos`s warder has been slain by Ghoul Lord!
    Bunnyslayer has been slain by Ghoul Lord!

Both read as "a person killed a named". At a camp where the named fights back — which is every camp
worth timing — two deaths of your pet twenty minutes apart put `Kainos`s warder` on the board with a
learned twenty-minute respawn. Measured on a replayed camp: two junk rows out of four.

The same replays turned up a second thing, about the other end of an observation.
[ADR 0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md) has `alive` outrank the clock in
both directions — it can say a mob is up before the window opens, and "it keeps saying so long after
the countdown would have given up". Taken literally, as it was implemented, *long after* means for
ever: a row marked up and never killed again was still sitting on **Coming up** a simulated month
later. The claim is right and the absence of any bound is not: half an hour after "it's up", either
you killed it — which arms a fresh clock — or you left.

Four other things the same replays found were plain defects with no decision in them, fixed and
tested without a record: re-deriving every camp's history on **every** kill (32 seconds to replay an
evening of 3000 named kills), an unbounded per-camp gap list crossing the IPC boundary (124 after one
evening), padding as long as the interval silencing a timer completely, and a timer that went stale
while the process was frozen popping a banner about a mob that came and went an hour ago.

## Decision

**A pet is never a named, and the log's own possessive says which names are pets.** `<Owner>`s warder`
is the only ownership EQ ever states, and it never states it about a mob — so `isOwnedName` is proof,
not a heuristic, and it needs no registry and works for a stranger's pet as well as yours. The
backtick is what makes it safe to match: EQ uses it as a letter in its own proper nouns
(`Cazic`Thule`), but never followed by `s ` — the possessive is always `` `s `` plus the thing owned.

**A person is never a named, and the log says who is a person by what they kill.** Anyone it shows
killing something **with an article** has killed a mob, and a thing that kills mobs is a player or a
pet. That is read from the records already on file, so nothing has to be injected and no new
vocabulary is learned.

**The subtraction happens at the question, not at the fold.** A name is claimed as a named when a
kill proves it, and excluded when the same log shows it killing a mob — in either order. Proof that
arrives at the end of an evening applies to the death at the start of it, which is the same
retroactive rule 0092 already set for named-ness itself.

The residue is a **charmed** named: killing a trash mob for its charmer marks it a person, and it
stops being timed. Rare, recoverable by hand-adding the mob (which states outright that it is one),
and the *safe* direction — 0092 already prefers a clean list to a row it cannot justify, and a junk
row is the failure a player cannot fix by waiting.

**A sighting holds a row for a grace after the later of the by-time and the sighting itself.** Both
halves are load-bearing. Anchoring on the later moment means seeing a mob can never make its row
leave *sooner* than the clock alone would have — a row disappearing because you looked at it would
be perverse — while a sighting after the by-time carries the row on past where the countdown gave up,
which is 0097's point. The bound is the **same grace** an overdue timer already gets, because it is
the same argument: past it, the row describes nothing anybody is still waiting for.

What the sighting **taught** is untouched by any of this. That lives in the camp's evidence, which is
persisted and ratchets; the row is just a clock.

Rejected alternatives:

- **Injecting a person registry** (the party list, the character name, the pet registry). All three
  know more than the kill log does, and all three would make `provenNamed` — a pure function over
  records, shared with the panel — depend on live session state. The log's own two signals cover the
  cases that actually appear, and a group-mate who never kills anything all evening is genuinely
  ambiguous rather than wrongly classified.
- **Reading the possessive as "whose pet"** rather than "a pet". `isTheirs` already answers the first
  question where it matters; here the owner is beside the point.
- **Leaving `alive` unbounded and pruning it somewhere else** — a second rule about the same state,
  in a different file, disagreeing with `spawnState` the first time either changed.
- **Treating a stale timer as still announceable** because the pop "hasn't been said yet". It has
  been missed, which is not the same thing, and 0092 already settled that a pop about the past is the
  opposite of what an overlay is for.

## Consequences

- The article test now has **three** inputs — the victim's article, the killer's, and what the log
  shows each name doing. That is more than a rule of thumb and it earns its keep: the board at a real
  camp is the difference between two rows and four.
- **`provenNamed` walks the records twice**, once for people and once for nameds. Cheap (measured at
  0.3ms over 3000 records) and what makes the answer independent of the order things happened in.
- A pet with **its own name** — the case `pet-registry.ts` exists for — is still invisible to this,
  and will be filed as a named if a named kills it twice. The registry knows better and is not
  reachable from a pure function over records; noted rather than solved.
- `alive` is now bounded, which contradicts a literal reading of one sentence in
  [ADR 0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md). Its *argument* is intact — an
  observation outranks a guess — and only "for ever" is gone.
- Learning one camp instead of all of them is now a parameter (`only`), so the per-kill cost is a
  property of that camp rather than of the whole log. The board still asks for everything, which is
  right: it draws everything.
