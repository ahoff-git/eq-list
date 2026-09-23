# 0270: The Damage tab becomes the Combat tab, and healing gets its own figures

## Status
Accepted

## Context
The tab has been called **Damage** since [ADR 0014](./0014-damage-meter-from-the-log.md), and every
ADR since has called it that too. But it was never only damage: `combat-parser.ts` has read a heal
line since the beginning (`HEAL_RE`), and `CombatantStat.healed`/`SpellStat.healed`/`overhealed`/
`invocationHealed` have carried real numbers for as long as the Spells table has existed
([ADR 0016](./0016-combat-history-and-spell-analytics.md)). None of that ever reached the tab's own
name, or its headline figures:

- **No fight/session total.** `totalDealt`/`yourDealt`/`yourTaken` summarize the window at a glance;
  healing had no equivalent, so "how much did we heal this fight" meant opening the Spells table and
  adding rows by hand.
- **No figure for what a target received.** A combatant's `healed` was always *healing this row did*.
  Nothing tallied *healing this row got* — a tank's own reason to care about the number — so "how much
  was I kept alive by" had no home at all.
- **No ranked view.** Targets, Dealers and Abilities each answer "who, of what, how" for damage
  ([ADR 0053](./0053-damage-is-cells-rolled-up.md)); a healer-heavy group had no equivalent list of
  who healed the most, short of opening every combatant's row one at a time.
- **The tab's name said the rest wasn't tracked.** A healer opening "Damage" and finding their own
  numbers folded into someone else's tab, under someone else's word, is the same mismatch
  [ADR 0088](./0088-alerts-are-a-tab-not-a-setting.md) named for alerts: what a feature is called is
  part of whether it reads as supported.

## Decision
**The tab is renamed Combat, and healing gets the figures damage already had.**

- `CombatantStat` gains `healReceived` — healing this combatant got, from any healer, a self-heal
  included — the same shape `taken` already gives damage. `FightStats` gains `totalHealed` (every heal
  in the window, the same "everybody's fights" scope `totalDealt` uses — [ADR 0067](./0067-the-meter-counts-your-party-s-fights.md))
  and `yourHealed`/`yourHealReceived` (you and your pet, mirroring `yourDealt`/`yourTaken`). All three
  are optional on the type and computed fresh every snapshot, the same way `manaSpent` and `tickDamage`
  were added after the fact — absent on a fight stored before this shipped, never a confident zero.
- The panel gains two stat tiles, **Your healing** and **Healing on you**, shown only when the window
  has something to report — the same restraint `Pet share` already uses, so a fight with no healer
  in it looks exactly as it did before.
- The meter gains a fourth view, **Healers**: `DamageMeter`'s `DamageView` grows a `"healed"` case,
  ranked the same way Targets/Dealers already are. It is a **flat list, not a drill-down** — nothing
  here rolls a heal into cells the way [ADR 0053](./0053-damage-is-cells-rolled-up.md) does for
  damage, so there's no tree to open. `hasBreakdown`/`canExpand` say so explicitly for this view
  rather than falling through to a damage row's own `specials` (a row's crit tally is about its
  *swings*, and showing it under a healing total would answer the wrong question).

## Consequences
- A healer can now see, at a glance, whether the group's healing kept pace with what it took — the
  same kind of answer the damage tiles have always given for damage.
- Healing still has no breakdown tree: no "who did they heal, with what spell" drill-down the way a
  damage row gets one. Building that wants the same cell-based rollup [ADR 0053](./0053-damage-is-cells-rolled-up.md)
  gave damage, which is real design work left for the day somebody wants it — today's Spells table
  already carries the per-spell figures for your own casts, and the Healers view carries the per-healer
  total.
- The in-app tab identity changes from `"damage"` to `"combat"`. The nav trail
  ([ADR 0173](./0173-back-goes-back-one-place.md)) persists tab names as plain strings and already
  tolerates one it doesn't recognize by falling back to the home tab — so a window reopened with an
  old, stored `"damage"` place lands nowhere useful exactly once, self-healing on the next tab click,
  the same one-time cost any tab rename would carry.
- Every other reference to "the Damage tab" in this app's fights, cells and scope rules
  ([0053](./0053-damage-is-cells-rolled-up.md), [0067](./0067-the-meter-counts-your-party-s-fights.md),
  [0136](./0136-logged-data-says-where-it-happened.md), and others) is untouched — this only renames
  the tab and extends its figures, not the rules that already govern what belongs in a fight.
