# 0149: A debuff is only tracked if it is yours

## Status

Accepted

Narrows what the buff board enrols, set by
[ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md) and extended to debuffs by
[ADR 0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md). How a debuff *behaves* once it has a
row — announced the instant it drops, swept when the fight ends — is unchanged.

## Context

ADR 0141 made a debuff the mirror image of a buff: both are effects with a target, both lapse, and
the board can hold either. That was right about the mechanics and silent about the direction, and
the direction turns out to be the whole thing.

A buff is symmetrical. One you cast and one somebody cast on you are the same news — *it is gone,
and you want it back* — which is why the landing sentence a group-mate's buff writes is the one
signal the feature could least afford to lose.

A debuff is not. `Snare` on a mob is yours to put back on. `Cripple` on you, on your pet, or on your
tank is something the thing you are fighting did **to** your side, and there is nothing to recast.
The board enrolled both, because enrolment asked only whether the log had named a lasting effect —
so a debuff cast at the group produced a row in a panel called Buffs, a standing "you are missing
this" over the player's own head, and a banner telling them to fix it.

Worse, nothing on the row said whose it was: a debuff's row was created by its *fade*, and only the
cast path ever set `mine` — so every debuff, including the player's own, read **cast on you**.

## Decision

**A detrimental spell earns a row only on evidence that you cast it.** A beneficial one still needs
no such evidence, and must not: somebody else's buff on you is the case that signal exists for.

- **The evidence is a cast we watched** (`castByYou`), not an inference. Asking the spell file which
  classes may cast a spell would need the player's class, which nothing in this app knows, and would
  be a claim about a character rather than about something that happened.
- **It is separate from `pending`.** A pending cast is a *moment* — seconds long, cleared at a zone
  line — because its job is to attribute a landing sentence arriving now. Whether a snare is yours is
  knowledge about the character, and it has to survive twenty minutes and three zones, which is the
  same distinction `combat-stats.ts` draws for its repertoire.
- **Across restarts, the row carries it.** A debuff row is written `mine`, so the durable answer is
  the one already on disk; the session set only has to bootstrap the first one.
- **The rule is pure** (`worthWatching`), and asked *before* enrolment. A refused spell leaves no
  trace: an enrolled-then-ignored row would still be a line in the panel to explain.
- **Old rows go.** A file written before this held rows for things cast *at* the player, which is
  exactly what the rule exists to prevent, so they are dropped on load and the file rewritten.

## Consequences

The Buffs panel is now a list of things you keep up plus things you put on mobs, and nothing else.
The reminder that fires the second a root drops still fires; the one that fired because a mob
crippled you does not.

**A debuff row now says "yours", truthfully**, because the only way to get one is to have cast it.

**The sweep costs a little.** An old file cannot tell your root from the one cast at you — neither
recorded a caster — so both go. It is self-healing: the next time you cast the thing and it wears
off, the row is back, this time saying whose it is. Rows written before `detrimental` was recorded at
all are left alone, since absent means *unknown* and sweeping on a guess is what this decision is
against.

**A debuff cast before the app started, fading after, is not caught** the first time. The board is
session-scoped by design ([ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md)) and this is the
same limit in a new place: the app reports what it watched. One cast and one fade later, the stored
row carries it for good.

**Nothing gates on the target.** It would have been tempting to keep a debuff row when the target is
a mob and drop it when the target is you — but a *named*'s log name is written exactly like a
player's ([`isEnemyTarget`](../../src/shared/buff-tracking.ts) already pays for that), and a rule
that leaned on the target would inherit that ambiguity. Who cast it has no such problem.
