# 0273: A heal is a cell too — the Healers view gets a drill-down

## Status
Accepted

## Context
[ADR 0270](./0270-the-combat-tab-tracks-healing-too.md) gave the Combat tab a Healers view, ranked
the same way Targets/Dealers are — but as a **flat list**: nothing rolled a heal into a cell the way
[ADR 0053](./0053-damage-is-cells-rolled-up.md) does for damage, so a row couldn't be opened. That
was the honest state of the data at the time, and 0270 said so in its own Consequences.

It didn't stay a satisfying answer. A healer-heavy group's real question is never just "how much did
Cleric heal" — it's "who was Cleric keeping up, and with what", the exact shape Targets/Dealers already
answer for damage. And the data to answer it was sitting right there in every `HealEvent`: `healer`,
`target`, `spell` are stated on every heal line the log writes, the same three facts a damage line
states about `attacker`/`target`/`source`.

## Decision
**Heals get their own flat cell, rolled up the same way damage's cells are, along two axes instead
of damage's three.**

- `heal-tree.ts` mirrors `damage-tree.ts`: a `HealCell` is a (healer, target, spell) bucket —
  amount, hits, crits, max hit, overheal — accumulated by `createHealCells`, the same shape
  `createDamageCells` builds, scaled down to the axes a heal actually has. Two things damage's cells
  track that a heal's don't: there's no **kind** split (a heal is always a cast, or nothing the log
  named at all — never melee/spell/other), and there's no **miss** (nothing in this log is a heal that
  whiffs).
- `FightStats` gains `healCells`, optional and absent on a fight stored before this shipped —
  identical treatment to `damageCells`'s own history.
- The Healers view's `drill` becomes `["target", "spell"]`: open a healer's row and it splits by who
  they healed, then what landed it — mirroring Dealers' `["target", "kind", "source"]`, minus the
  kind level a heal has no use for.
- Rendering is a **parallel, smaller** set of components (`HealLevel`/`HealBranch` beside
  `Level`/`Node`) rather than a generalization of the damage ones. `DamageNode` carries damage's four
  fixed-denominator shares (`DamageShares`) and its ticks/misses/hit-rate — none of which a heal has an
  honest answer for — so forcing `HealNode` to duck-type as a `DamageNode` would mean either padding it
  with meaningless zeros or teaching every damage-share consumer to handle a heal that has none. A
  `HealNode` states only what a heal actually has: `amount`, `hits`, `crits`, `maxHit`, `overhealed`,
  and `share` (of the level above — there's no fixed "whole fight" denominator for healing yet, the
  same way damage didn't get one until [ADR 0053](./0053-damage-is-cells-rolled-up.md) built `enemiesIn`
  for it).
- A row's damage `specials` (its crit tally from *swinging*) still play no part in the Healers view —
  0270 already drew that line, and it stands: `canExpand` under this view asks the heal cells only.
- Two more stat tiles ride along, both cheap now the cells exist: **Overhealed** (every cell's
  `overhealed`, summed) says how much of the window's healing was wasted, and **Your HPS** (healing ÷
  `durationSec`, the same rate `yourDps` states for damage) sits beside **Your healing** the way DPS
  already sits beside damage. Neither needed a new `FightStats` field — both are derived in
  `DamagePanel` the way `petShareOfYours` already is, since nothing else reads them.

## Consequences
- "Who did Cleric mostly heal, and with what" is now answerable in the same two clicks Targets/Dealers
  already offer for damage — closing the gap 0270 left open and the Open Question it raised in
  [decisions/README.md](./README.md).
- Two black-box test files carry the guarantee that matters: `heal-tree.test.ts` asserts a heal tree
  sums to its parent at every level (the same property `damage-tree.test.ts` holds cells to), and
  `combat-stats.test.ts` reconciles `healCells` against `byCombatant`'s `healed`/`healReceived` and
  `FightStats.totalHealed`, both ways round.
- A heal's `share` is only ever relative to the level above it — there is no "share of all healing in
  the fight" the way `DamageShares.ofFight` exists for damage, because nothing here yet has healing's
  equivalent of `enemiesIn` (which side someone was healing *for* isn't the same question `damage-tree.ts`
  answers, and inventing one wasn't this ADR's job). Worth building if a fixed-denominator heal share
  is ever asked for.
- `HealCell`/`HealAxis`/`HealNode` live in `types.ts` beside their damage counterparts, and `heal-tree.ts`
  beside `damage-tree.ts` — same filing, same reason: a black box the tracker fills and the UI reads,
  fully pure and independently testable.
