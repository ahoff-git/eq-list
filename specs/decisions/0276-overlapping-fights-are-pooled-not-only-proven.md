# 0276: Overlapping fights are pooled, not only proven

## Status
Accepted — supersedes [0275](./0275-a-shared-swing-proves-the-same-fight.md)

## Context
[ADR 0275](./0275-a-shared-swing-proves-the-same-fight.md) used a shared swing to *prove* two peers
were in the same fight, then stopped there: `PeerFightCompare` showed the two sides' figures next to
each other, unmerged, on the same "compared, never touched" terms `PeerScores` already sets for a
high score.

That stopped short of the fix the proof actually made possible. The reason two logs disagree in the
first place is EQ's own earshot rule: a healer standing back from melee, or a caster who joined the
pull a few seconds late, simply never logged some of what happened — not because anything went
wrong, but because they weren't close enough to hear it. Once two peers' hits are *proven* to be the
same encounter, the honest move is to pool what each side actually saw into one picture that is more
complete than either log alone, not to leave each side showing its own gaps side by side.

## Decision
**A confirmed overlap pools the fight, not just compares it.**

- `CombatStats.recentHits`/`recentHeals` grow from a small 20-entry fingerprint sample
  (`MAX_RECENT_HITS`) to the *whole* fight, generously capped (300 each) — because proving a match
  needs only a couple of shared entries, but pooling one needs everything either side has. `FightHit`
  gains the fields a bare (attacker, target, amount) proof never needed but a merged damage-cell
  breakdown does: `melee`, `verb`, `spell`, `shield`, `qualifier`, `tick`, `damageType` — mirroring
  `DamageEvent` minus `logId`/`raw`. `FightHeal` mirrors `HealEvent` the same way.
- `electron/fight-merge.ts`'s `mergeFight` does the actual pooling: union everyone's hits and heals,
  de-duplicating an event two sources both report (same attacker/target/amount, within
  `MERGE_TOLERANCE_MS`) down to one, sort the survivors chronologically, and **replay them through a
  fresh `createCombatStats()` instance** — the same tracker `main.ts` and `log-import.ts` already
  trust for every other fight, seeded with the party roster so `fight-scope.ts`'s `ours()` admits a
  pooled peer's exchanges rather than refusing them as a stranger's business
  ([ADR 0067](./0067-the-meter-counts-your-party-s-fights.md)). Reusing the tracker rather than
  hand-rolling a second aggregator is the whole reason this was tractable: every rate, split and
  crit-tally the meter already computes correctly falls out of the replay for free.
- **What gets pooled, and what stays personal.** Only the parts of a `FightStats` that describe the
  encounter itself are replaced: `byCombatant`, `damageCells`, `healCells`, the damage/healing
  totals, `yourPerSec`, and the window's own span. Kills, experience, loot and spell efficiency are
  never touched — they're personal rewards and references, not facts about the fight, and pooling
  them would misreport what you actually earned (a party-mate's XP is not yours, however completely
  their log fills in your damage numbers). `yourDealt`/`yourTaken`/`yourHealed`/`yourHealReceived`
  stay correctly *yours* throughout, since the replay's own `mine` flag is still just you and your
  pet — a pooled party-mate gets their own row, never blended into yours.
- **Party-gated, overlap-confirmed** — the same two-part rule ADR 0274 first drew and ADR 0275
  dropped is back, for a stricter reason this time: `matchedFights` (ADR 0275's proof) still decides
  *whether* a peer's data is genuinely this fight, but *whose* data is eligible to be pooled at all is
  decided by party membership first (`electron/ipc.ts`'s `mergedFight`, filtering `shares.received()`
  to `combat.party()` before proof is even checked). A stranger hitting the same contested mob would
  otherwise produce a real, provable overlap — EQ logs it to both of you regardless of grouping — and
  pooling their damage into your total would misreport what your own side actually did. Party
  membership is the same safe gate the rest of the tab already trusts for "whose side is this"
  ([ADR 0067](./0067-the-meter-counts-your-party-s-fights.md)); overlap on top of it is what confirms
  a party-mate's shared fight is *this* encounter and not one they're having somewhere else.
- **Replaces "This fight" outright.** `mergedFight()` is applied to the live push
  (`combat.onChange`), the on-demand read (`CH.combatGet`/`CH.combatReset`), and the fight as it's
  filed (`combat.onFightEnd`) — one function, three call sites, so the tab never shows one set of
  figures while History banks another. `FightStats.mergedFrom?: string[]` names who was pooled in,
  and the panel says so plainly ("Pooled with Bran, Galactic") whenever it's present.
- **The merged version is what gets saved.** A stored fight is now the fullest picture available at
  the moment it was filed, not a promise to only ever show your own log's figures. This is a real
  change to what "your history" means — reversible in principle (nothing here deletes the source
  data `mergedFrom` was built from), but not undone automatically.
- `PeerFightCompare` and the whole "show a comparison table" surface from ADR 0275 are removed. There
  is nothing left for a separate table to show: a confirmed party-mate's rows now simply appear
  inside the same Targets/Dealers/Abilities/Healers breakdown everyone already reads, which is the
  whole point — pooling data should look like more complete data, not like a second feature bolted
  beside the first.

## Consequences
- A merged fight is provably more complete than any single log for the parts that matter most
  (damage and healing), and it can even improve *your own* recorded figures — a swing your own log
  missed but a party-mate's log caught is now yours in the total, correctly, because the union
  includes it.
- **Known gap: misses aren't pooled.** Only landed hits/heals are kept in `recentHits`/`recentHeals`,
  so a merged row's accuracy/hit-rate figures reflect only what your own log saw swing at, not what a
  party-mate's log also missed. Worth closing the day someone actually wants an accurate merged
  accuracy figure; this round's ask was the damage and healing totals.
- A named pet with a non-possessive name (a magician/necromancer pet not written as `Owner\`s
  warder`) is not recognized as "mine" inside the merge's fresh replay, since pet-engage lines aren't
  among the events pooled — the same narrower gap ADR 0077's registry exists to close for a live
  tracker, not reproduced here. Most pets are written possessively and are unaffected.
- The wire payload for `fight` grows from a handful of fingerprints to up to 300 hits and 300 heals
  per side — still small next to `kills`/`mobs`' 5000-row caps, and still `off` by default like every
  other personal `live` kind.
- `electron/fight-merge.ts` is tested as a black box (`electron/tests/fight-merge.test.ts`): a hit
  both sides saw counts once, a hit only one side saw is added in, a matching amount far enough apart
  in time is a different swing, healing pools the same way damage does, and a peer's own exchange
  with the mob is admitted as party rather than refused as a stranger's.
