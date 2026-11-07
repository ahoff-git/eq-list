# 0361: Damage taken is read over a window, and priced by the wiki's resist rule

## Status

Accepted

## Context

The player (2026-11-06) asked for the app to watch the combat log, notice what *kind* of damage it is
taking most, and suggest armour that hardens against it — and then that the reading be a **window**, since
what hits you changes with where you are and a new zone should refresh the advice.

Most of the data existed. The log gives every spell hit's damage type, and fight cells keep it
([ADR 0344](./0344-fight-search-finds-combatants-and-reads-trends.md)). What did not exist was what a resist
point is worth: [ADR 0331](./0331-a-stat-s-worth-depends-on-where-your-totals-sit.md) listed "6 points per 1%"
among the unmodelled curves. eqlwiki's [Statistics](https://eqlwiki.com/index.php/Statistics) page (Resists)
states the rule, taken from EQEmu discussions and flagged there as "not necessarily correct for EQL": every 6
resist points give a 1% greater chance to fully resist a spell, a level difference moves it (about 12% at 7
levels, 20% at 10), and PvE caps it at 5%–95%. It also names **six** types — Poison, Magic, Disease, Fire,
Cold, Void — where the app reads five off items.

Replayed against the real history (3,306 fights), the answer depends heavily on where you are: over the whole
log damage taken was 81% melee, 9% magic, 3% fire, 3% cold; but one visit to the Permafrost Caverns was 50–70%
cold, and Nagafen's Lair 21–53% fire. A reading over all time would hide exactly what a window shows.

## Decision

**Damage taken is tallied by type over a window the player chooses, and a resist is suggested when its type is
a tenth or more of it.**

- **The window** (`damage-window.ts`): *this zone* — the leading run of fights in the place you are in now,
  so zoning empties it (the default); *this sitting*; *recent fights* — the newest the history search returns
  (its cap, 100). A zone's difficulty or ruleset is the same place. The window is one persisted setting owned
  by `page.tsx`, so the status bar and the builder cannot disagree.
- **The tally** (`damage-profile.ts`): damage **to you** only, and only damage that **landed** — a fully
  resisted spell is a "You resist" line, not damage. Melee, the six resist types, and a remainder (untyped DoT
  ticks, damage shields) that no resist can be named for.
- **The rule** (`resist-worth.ts`): the wiki's, to first order. A point is 1/6 % chance to fully resist,
  capped at 95%, **points only** — the log carries no attacker level — and **worth the same on every type**,
  so choosing a resist is choosing the type with the most damage. Logged damage is turned back into raw
  damage with the worn gear's points, which are all that is known (buffs, race and AA are not). The step shown
  is +30 points.
- **A suggestion** is a type that is at least `FLAG_SHARE` (10%) of the damage in a window with at least
  `MIN_HITS` (30) landed hits, and for which the app has a resist stat to raise. Void is shown, never
  suggested. Melee is never flagged: no resist touches it, and there is no AC model to judge it by.
- **Where it shows.** A *Damage taken* section in the loadout builder (yours only — not while planning for a
  peer), open by itself when something is worth a look, listing each type with what your gear gives and what
  +30 points would cut; and a **status-bar pill** when there is a suggestion, which opens that section
  ([ADR 0326](./0326-the-status-bar-is-a-way-in.md)).
- **When it refreshes.** The history is re-read when a new fight starts and when its background cache lands
  a fresher answer — never mid-fight — and the window is re-cut when you zone. A new zone's empty window
  gives no advice, and the old zone's is **not** carried over or kept on show (simpler than keeping it
  labelled as old, and never wrong about where you are).

## Consequences

- **The pill will often be on.** Over the real history, 59% of visits with enough hits had a type at 10% or
  more (48% at 15%, 38% at 20%, 28% at 25%); most of those were *magic*, which is a catch-all type. The
  threshold is one constant. In the player's current zone (Old Guk, 99% melee) there is no pill.
- **Every figure is an estimate** and the section says so: the rule is from EQEmu, the level difference is
  left out, and gear points exclude buffs and AA.
- **This is a reading, not a plan.** Nothing here changes what best in slot picks; turning a suggestion into a
  goal is left to the player (set a goal on the resist), and swap suggestions need an AC model to weigh a
  resist against armour.
- **Not built:** hysteresis on a type wobbling around the threshold; an SV Void stat (todo); typing DoT ticks
  from the spell file's resist column; per-group-mate damage.
- The widest window is the history search's 100 fights, not all time.
