# 0195: A spell catalog trusts the wiki's own numbers, not the game file's

## Status

Accepted

## Context

Items have a browsable catalog — the Items tab — that filters and sorts every item page already
cached, ranked by a yardstick the player supplies
([ADR 0152](./0152-an-item-search-is-a-filter-with-your-own-yardstick.md)). Spells had no equivalent:
the only sortable spell table is the damage meter's, and it only ever shows spells a fight actually
cast ([ADR 0016](./0016-combat-history-and-spell-analytics.md)). Asking "which of these spells hits
hardest for its mana" — a question you'd want to ask *before* you've cast any of them — had no table
to ask it of.

The obvious source for a spell's numbers is the one the tracker already trusts:
[ADR 0080](./0080-the-game-s-own-spell-file.md) reads `spells_us.txt` from the player's own install
for mana, cast time, recast time and per-class levels — but it deliberately **refuses to read
damage**. Damage lives behind the file's per-effect formulas, and applying them is server-side logic
that only EQEmu's classic-era reference implements, with nobody able to confirm this server matches
it. 0080 calls reading that blob "trading a fact for a guess" and declines.

That refusal is correct for what 0080 is protecting: a figure the tracker **persists with a stored
fight** and presents as measured. But a browsable catalog is asking a different, narrower question —
not "what does this spell do", but "which of these spells, ranked against each other, hits harder" —
and the wiki's own spell pages already answer a version of it in plain text: a labelled `Range: 200`
line, and either a consistently-shaped scaling line (`"Decrease Hitpoints by 11 (L3) to 14 (L8)"`) or
hand-written prose (`"burns your target, doing 14 damage"`). Neither is the exact, per-rank figure
0080 was protecting; both are good enough to rank spells against each other, which is all a catalog's
Damage column claims to do.

## Decision

**The Spells tab's catalog is built entirely from cached wiki `.eql-spellpage` pages, and its
approximate numbers are a deliberate, narrower-scope choice — not a reversal of ADR 0080.**

- 0080 governs the **tracker**: a per-rank, install-exact figure, computed once and persisted with a
  fight. This ADR governs a **browsing tool**: a ranking aid, computed fresh from whatever's cached,
  never persisted anywhere but the page cache itself.
- Mana, cast time, recast time and range are read as plain `Label: value` lines off the spell's own
  wiki card — the same shape `hooks.ts`'s existing per-spell wiki lookup already trusts for mana and
  cast time on the damage meter's fallback path.
- Damage has no structured source at all, so it's read best-effort: the wiki's own scaling
  `"Decrease Hitpoints by N (L_) to M (L_)"` slot line first (consistently shaped across nearly every
  damage spell, and the higher, max-rank figure is taken when it scales), falling back to prose
  (`"causing/doing/dealing N damage"`) only when no slot line matches. A card matching neither leaves
  damage **unknown**, never a guess.
- The catalog is sourced from the wiki page cache only — the same corpus, and the same "it grows as
  you browse rather than pretending to be complete" honesty, as the Items tab. No join against the
  game file, no Lucy merge, no on-disk pack, no stat-weight scoring, no era toggle: none of these are
  needed by a first version and can be added later without disturbing the shape.
- The new types (`CachedSpell`, `SpellRow`, `SpellStats`) are deliberately **not** named `SpellFacts`
  — that name already names two unrelated shapes (`spell-file.ts`'s game-file facts,
  `hooks.ts`'s per-spell wiki lookup) and a third collision would compound the confusion rather than
  fix it.

## Consequences

- A caster can now ask "what's worth learning at my level" before casting anything, which nothing in
  the app answered before.
- Damage and mana-per-damage on this tab can be wrong, or missing, for a spell whose wiki prose
  doesn't match either extraction pattern — and unlike the tracker's figure, there is no measured
  fallback to fall back to. The column is labelled and titled accordingly.
- The catalog only holds spells whose wiki page has already been fetched, exactly like Items — a
  spell nobody's looked up yet simply isn't in it until it is.
- A future join against the game file's exact mana/cast/recast/levels (for a player whose install we
  can find) is possible without changing this shape — the wiki figures would simply be the fallback,
  the same relationship the damage meter already has between the two sources.
