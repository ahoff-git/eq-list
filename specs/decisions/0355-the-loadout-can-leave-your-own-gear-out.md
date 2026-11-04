# 0355: The loadout can leave your own gear out

## Status
Accepted

## Context
The loadout plans from what you hold, at the grades you've merged it to, and optionally from the
catalogue beside it ([ADR 0329](./0329-the-loadout-is-one-plan-of-what-you-hold-and-what-to-hunt.md)).
Held gear's `+` values make it outscore everything in the catalogue, so "what is the best gear I could
get, unupgraded?" had no answer: owned + hunt always started from your upgraded pieces, and owned-only
never looked at the catalogue.

## Decision
- **`BisOptions.includeOwned`** (default true) switches your holdings in or out of the plan. Off, the
  plan runs as if there were no inventory dump: every item comes from the catalogue, weighed at the
  hunt grade (`+0` unless set), and nothing you wear or hold counts, upgraded or not.
- Leaving owned out forces hunting on (normalised in `bis-options.ts`, applied in `bis-plan.ts`) — owned
  off and hunt off would plan from nothing. The page hides the Owned-only / Owned + hunt choice meanwhile.
- The switch is a setting like the hunt switch: kept by Reset and carried into presets.

## Consequences
- "Wearing now" is empty while owned gear is left out, as it is with no dump; compare against the
  plan with the switch on.
- Locks on held items fall back to the catalogue copy, as they do when hunting is on.
