# 0365: Winning comfortably suggests trading survivability for damage

## Status

Accepted

## Context

[ADR 0361](./0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md) to
[0364](./0364-a-fight-you-died-in-says-how-to-survive-the-next.md) all answer a *problem*: a resist, armour, mana or
health. The player's next thought (2026-11-07) was the other direction: if you are chewing through mobs and not
dying, say so, and suggest giving up some armour, health or mana for damage output.

Three things had to be settled before it could be built.

- **What "not having issues" can mean when the log never states your health.** The only bound is
  [ADR 0018](./0018-inferred-max-hit-points.md)'s, and it is loose (a floor of 201 and a ceiling of 1,809 on the
  real character) while a healed fight routinely takes many times that: the largest of the last 400 fights took
  27,561 damage and the median 182. "The worst fight was a small share of your health" is therefore not a test that
  can be passed. What the log does state is **deaths**, and what you dealt and took.
- **What "more damage" is, in the builder.** The builder models one thing: the melee swing
  ([`melee.ts`](../../src/shared/items/melee.ts), eqlwiki's working model — weapons in both hands, haste, optionally
  proc damage; it leaves STR, ATK and mitigation out). Armour touches it only through the one haste item. It already
  has a name for planning for it: the **Melee damage** preset (`swing` first, HP and AC held at 70% of the most any
  loadout reaches). So "more damage" is what that plan swings, against what the plan for the player's own goals does.
- **Against what.** Run on the real inventory, the player's own goals (`swing` at priority 100 and an AC floor)
  already plan a swing of 19.6, and the Melee damage preset 19.8 — a 1% difference, bought with 40 AC. What is worn
  is 15.5, so against *wearing* the preset looks like +28%, but nearly all of that is simply "wear the loadout you
  already planned", which is not a trade and is not this suggestion. Against a tank-leaning goal set with a 95% mana
  floor, the same preset swings 20 where the plan swings 6, for mana 3,601 → 1,569. The honest comparison is plan
  against plan.

Measured on the real history (3,306 fights, 218 zone visits): with no deaths and half or more of your own damage
dealt in melee, **5 visits** qualify, all in the last week (the Northern Desert of Ro twice, the Warrens, Stonebrunt
twice) — before then this character's damage was spells and pet. Drop the melee condition and 65 of the 218 visits
are deathless and light-taking, so the melee share is what makes this the exception. The taken-to-dealt ratio has a
median of 0.135 per visit (p75 0.209, p90 0.336); at a cap of 0.2 it changes no verdict on this history.

## Decision

**When a window of fights shows you winning comfortably with your own sword, and the damage-first plan would swing
meaningfully harder than the plan for your goals, say so — with what the harder swing costs in AC, health and
mana.** It is shown the same ways as the others (the pill, the builder's *Damage taken* section) and is the
pill's face only when nothing else is wrong.

- **Comfortable** (`cruising.ts`, all of it, over a window — zone, sitting or recent): at least 10 fights
  (`MIN_CRUISE_FIGHTS`); **no death in any of them**; damage taken at most 20% of damage dealt
  (`CRUISE_TAKEN_RATIO`); not running dry in a real share of the fights you cast in (`runsDry`, the same test mana's
  suggestion uses — if mana is short it is not offered up); and at least half of what **you** dealt (not your pet)
  was melee (`CRUISE_MELEE_SHARE`). The two damage sums come from the fight's damage cells, taken by the same
  `landedOnYou` rule the damage profile uses.
- **The offer is a swap, not a gain over what you wear** (`lean-loadout.ts`). The builder plans the **Melee damage**
  preset (`LEAN_PRESET`) the way it plans your goals, from the same pool, criteria, weights and melee model, and
  publishes a `Lean` — swing score per second, AC, HP and mana, each as *your goals' plan → the damage-first plan* —
  beside the figures it already publishes. A swing gain is worth saying at 2 points and 10% of the plan's, the same
  rule as every other gain (`worthSaying`). A plan that already swings that hard — including the player whose goals
  put damage first — hears nothing.
- **What it costs** is only the pools that *fall* by enough to mention, judged by each stat's own minimum (5 AC, 20
  health, 50 mana, and the shared 10%). Nothing that falls enough says "at next to no cost in AC, HP or mana".
- **Said last, and only alone.** `adviceOf` puts the swing after every problem and says it only when there are none:
  "take more AC" beside "give some AC up" is advice arguing with itself. The pill's glyph for it is ⚔, not 🛡.
- **Planned off the render, after the main plan.** The damage-first plan is solved with the goal search the builder
  already has (`solveGoalsAsync`, a plan at a time, aborted when a newer ask replaces it) in `useLeanLoadout`, and
  only once the main plan exists. While a newer one is being made the last answer stands, so the pill does not blink.
  It is not planned for a peer. On the real inventory it is 9 plans and about 600 ms.
- **Not in a single fight.** A fight can show you dying; it cannot show you winning comfortably.

## Consequences

- **The thresholds are judgements.** Ten fights, no deaths, 20% and half-melee are set so the pill is the exception
  (5 of 218 visits on the real history). Only the melee share and the no-death rule did any choosing here; the
  20% ratio is a guard for harder content and is a constant in `cruising.ts`.
- **A single death ends it for the rest of the window,** however many fights came before. That is deliberate — the
  suggestion gives survivability away — and it comes back when you zone and the window empties.
- **It can flicker at the edge.** The melee share of a window hovers near half in some visits (the 1 November Ro
  visit flags at 8 of its 23 window sizes), so the pill can come and go as fights finish. No hysteresis is built.
- **Mana is a cost the evidence only partly covers.** Not running dry says the pool is enough *now*; the preset sets
  no mana floor, so the damage-first plan can shrink it a long way (3,601 → 1,569 above) and the sentence prints that.
  A caster who casts a lot and never runs dry is exactly who could be misled by it, which is why the cost is named.
- **Damage is the swing score, a yardstick.** It is eqlwiki's working model, not a parse; STR, ATK, spell damage and
  pets are not in it, and armour matters only through haste. The percentage is a comparison between two plans, not a
  promise about a fight.
- **It follows the builder like the rest.** Nothing is said until the builder has planned for the current inventory
  (the `Lean` is dropped with the other figures when a newer dump arrives), and it needs melee in the player's
  goals or weights to mean much; a character who never swings hears nothing.
- Not built: applying the preset from the pill in one click (it would replace the player's goals, including a mana
  floor they set), hysteresis, weighing a caster's spell damage, and a mana floor taken from how much you actually
  spend in a fight.
