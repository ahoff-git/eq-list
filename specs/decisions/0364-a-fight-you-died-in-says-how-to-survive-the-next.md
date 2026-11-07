# 0364: A fight you died in says how to survive the next

## Status

Accepted

## Context

[ADR 0361](./0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md) to
[0363](./0363-running-dry-and-dying-suggest-mana-and-health.md) suggest a resist, armour, mana or health over a
*window* of fights, in the loadout builder and the status bar. The player's next request (2026-11-06) was to wire
the same into the fight analytics: when a boss kills you, say how to survive it next time.

The fight analytics already shows a **Deaths** block under a fight — the killer, what landed in the 15 seconds
before, and that burst against an inferred maximum health
([ADR 0018](./0018-inferred-max-hit-points.md)). It stops at the diagnosis.

A window and a single fight are different evidence. Over a window a death has to *repeat* to mean something
(0363's two deaths and a tenth of the fights). In one fight, the death is already the whole point. Run on the real
history, the 101 fights you died in all have something to say (35 name a resist, 60 armour, all health, given the
builder's figures); the newest Nagafen deaths read 71% fire, and 55–63% melee with fire and cold behind it.

## Decision

**Under a fight's deaths, a *Next time* block lists what that fight says to change, in the same order and words
as everywhere else** (armour, resists, mana, health last). It is shown for a single fight — the live one or one
picked from history — not for a session, whose deaths are many fights.

- **One fight is read on its own terms** (`survival.ts`). What hit you is the fight's own damage with the usual
  bar of 30 landed hits (70 of the 101 death fights clear it; a thinner one names no resist or armour, because a
  handful of hits is a coin-toss at a 10% share, however it ended). Health is offered because you **died** in it,
  mana because you **ran dry** in it, with no window rate to clear — the fight is the evidence.
- **Armour, mana and health are priced from the builder's figures**, exactly as in the pill, through the shared
  `headroom.ts` question and the same minimum gains; the resists need no figure and show regardless. Without a
  plan for this inventory the block says so and what to do (open the builder once). The "only this inventory's
  figures" rule now lives in one hook (`useHeadroom`) that the pill, the section and this block all read.
- **Health is said against the burst.** The sentence gives what landed on you in the last 15 seconds and the
  gain as a share of it (`+59, about 2.6% of that burst`), because the same fixed gain is nothing against a
  3,700-damage burst and something against a 700 one, and the player shouldn't have to do that sum.
- **The wording takes a scope** (`AdviceScope`: a window or `"fight"`), so a fight says "You died in this fight"
  where a window says "in 3 of 14 fights since you arrived here", and the three places can't drift.
- **Correction to 0363:** it said the log never states your health, so how close a fight came is unknowable. The
  app infers a maximum (ADR 0018) and shows it beside each death. It is a bound, not a reading — the floor is what
  you survived, the ceiling what killed you from full — and it is not used to decide anything here, only the burst
  and the gain are compared.

## Consequences

- **Gear is often a small answer to a big death.** Against 2,000–4,000 damage in 15 seconds, +59 health or +30
  fire resist is a few percent. The sentences now say how few, which is the honest result: the block names what
  gear could change, not that gear would have saved you.
- **Nearly every death gets a health line** while the builder's loadout reaches more health than you wear, since
  the evidence is the death itself. That is by design, and it is the percent against the burst that keeps it from
  reading as a promise.
- A death with a thin fight, no builder figures, and no armour or health to gain shows *Nothing stands out*.
- **Session scope shows no block**; picking the fight shows it.
- Only the newest death's burst is used when a fight holds several (rare: 103 deaths in 101 fights).
- Not built: weighing the burst against the *inferred* maximum health to say how much more would have been
  needed, naming the slots that change, and advice for a session's deaths.
