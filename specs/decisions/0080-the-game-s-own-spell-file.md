# 0080: The game's own spell file

## Status

Accepted

## Context

The log says what you cast and what it did. It never says what it **cost**. So the one question a
damage meter can't answer from the log alone is the most useful one a caster has: is this spell
worth its mana?

We already had half an answer. `useSpellFacts` reads a mana cost off the spell's **wiki page** and
the Spells table shows a per-mana column from it. That works, and it has three limits: it needs the
network and a wiki page that parses; it covers mana and cast time only; and it lives in the
**renderer**, fetched per view — so the figure never reaches the tracker, and a *stored* fight has
no mana in it at all. History can't show efficiency, because efficiency was never in the record.

Meanwhile the number is sitting on the player's own disk. `spells_us.txt` ships in the install,
beside the `maps/` folder we already read ([ADR 0042](./0042-only-the-game-s-own-maps.md)), and
holds mana, cast, recovery and recast times, and per-class levels — for **every rank as its own
row**, which is what makes a per-rank figure exact rather than scaled by a rule of thumb.

Reading it was an [open question](./README.md): a map file is a stable format we already parse,
while the spell file is a 171-column layout that EQL has shifted mid-patch by inserting a column.
That is a real maintenance commitment on a file we don't ship and can't version.

Two things settle it. The layout is **documented, not guessed** — eql-info's `SPELL_FORMAT.md`
derives it by diffing EQL's file against Live EverQuest's and the EQEmu reference, and
eql-log-reader arrived at the same indices independently ([neighbours.md](../neighbours.md)). And
the instability is *bounded*: columns 0–102 have never moved, and everything worth reading is
below 52.

## Decision

**Read `spells_us.txt` from the player's install, for the scalar facts the log can't state.**

- Columns **≤ 51 only**, deliberately, so a patch that appends or inserts later columns cannot
  change what we read. Nothing counts columns or validates a total width; a row needs only to be
  long enough for the fields wanted.
- **Stop at the scalars.** The effects blob carries damage and heal magnitudes behind per-effect
  formulas, and applying those formulas is *server-side logic* — every implementation available is
  EQEmu's classic-era one, which nobody can confirm EQL matches. We don't need it: the log already
  says what a spell actually did, measured, on this server. Reading the blob would trade a fact for
  a guess. Buff duration is excluded on the same grounds.
- **A name resolves to a spell a player can hold.** The file ships ~74k spells through level 125,
  including NPC and out-of-era versions sharing player spell names. A row castable by some class at
  or below the server's cap of 50 wins; among equals the first seen wins.
- **Priced at the rank actually cast.** The log writes the rank in the cast line and the base name
  everywhere else, which is why `spellName()` strips it and `spellRank()` keeps it; the ranked row
  is the exact answer and the base name is the fallback.
- **The tracker owns the figure**, via an injected lookup — so it stays free of I/O, and mana lands
  on `SpellStat` where it is computed once and **persisted with the fight**.
- **Unknown and free stay distinct.** An absent cost means "we don't know"; `0` means the spell is
  free, as bard songs are. A free spell gets *no* efficiency rather than a division by zero.
- **Spend is derived, and says so.** The log reports no mana, so spend is `casts × cost`, assuming
  a cast begun spends its mana — including a fizzle, which is how EQ has always behaved and why a
  fizzle stings.

**The wiki stays as the fallback**, not as a rival. The client file wins where we can read it;
the wiki answers for an install we can't find (a custom path, a moved Logs folder). One column, one
definition of per-mana — the tracker's — with the wiki path computing the same thing only when the
tracker had no cost to work from.

## Consequences

- Damage per mana is now a **stored** property of a fight, so history and comparisons can use it.
  That's the thing the wiki path structurally could not do.
- No install, no file, no mana figures — and nothing else changes, exactly as a missing map pack
  leaves the map blank rather than breaking the window.
- The file is read **lazily, once**, on the first question: it is tens of megabytes, most sessions
  never ask, and startup is already the app's tightest budget.
- We now depend on a file that patches weekly. The stability rule is the mitigation, and the failure
  mode is degradation — a column that moves yields an absent or obviously-wrong figure, not a
  crash. It is worth re-checking against `SPELL_FORMAT.md` after a major patch.
- The per-mana denominator changed from *landings* to *casts*. The old figure ignored fizzles,
  which flattered exactly the spells that fizzle most.
- Cast/recast times and per-class levels are now readable and currently unused — the obvious next
  consumers are comparing the file's stated cast time against the measured one, and gating anything
  that needs "can this character even cast it".

### Verified against a real install (2026-08-13)

Recorded here because the decision was taken against a *documented* format with a synthetic
fixture, and it has since been checked against an actual `EverQuest Legends` install. Every
assumption held, and two numbers in the Context above are now sharper:

- The live file is **173 columns**, not the 171 eql-info documented — EQL has added two since that
  reading. Nothing broke, which is the point: not validating a total width is what made the parse
  survive its own premise changing. Every index we read was confirmed correct.
- **73,963 rows, 66,428 distinct names, parsed in ~400 ms** from 38 MB. Lazy loading is justified;
  eager loading would have been a visible cost for a mostly-unused feature.
- Spot-checked against classic knowledge and all correct: Minor Healing 10 mana at level 1 for all
  six healing classes; Burst of Flame 4; Spirit of Wolf 40 at Druid 10 / Shaman 9. **Chant of
  Battle is genuinely 0 mana**, confirming the free-vs-unknown distinction on real data.
- **The rank rule earns its place, and scaling would have been badly wrong.** 129 ranked families
  are obtainable, and cost does not scale gently: Burnout runs 35 → 75 → **150** across three
  ranks. Quoting the base rank's figure, or applying a percentage per tier, would misprice a spell
  by 4×.
- **The collision rule earns its place too.** 3,603 names carry more than one row, and in **299**
  of those the obtainable-wins rule is what decides — cases where taking the first row could quote
  a spell no character on this server can cast.
