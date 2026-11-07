# 0362: Melee damage suggests the AC the loadout already reaches

## Status

Accepted

## Context

[ADR 0361](./0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md) never flagged melee:
no resist touches a swing, and the app has no model of what AC is worth, so it could not say how much armour
helps. The player's reply (2026-11-06) was that this misses the point — if the damage is physical, the app
should say so when more AC is lying around.

They are right, and the missing model was the wrong reason to stay quiet. Ranking needs no model of what AC is
worth, only whether more of it is on offer. The loadout builder already answers that: its loadout is planned
for the player's goals from what they own, and its stats set the AC worn beside the AC it reaches. Replaying the
player's real inventory, saved goals (AC at 90%, a 75% floor) and the catalogue, with Wizard ticked (their
saved class filter wasn't readable), gave **AC 60 worn against 125 in the loadout**, while 74–99% of the damage they take is melee.

## Decision

**When melee is at least half the damage taken, and the builder's loadout reaches meaningfully more AC than is
worn, that is a suggestion — shown the same ways as a resist's.**

- **The figure is the builder's own.** `acSuggestion` compares two totals the builder already has, attributes
  counted: worn AC and loadout AC. Because the loadout follows the player's goals and weights, it is AC *with
  the build kept*, not AC at any price. It is "meaningfully more" at 5 AC and 10% of what is worn, whichever is
  larger (`MIN_AC_GAIN`, and the ratio shared with health and mana, `MIN_GAIN_RATIO` — [ADR 0363](./0363-running-dry-and-dying-suggest-mana-and-health.md)),
  and the window needs the usual 30 hits.
- **The pill borrows it.** The status bar cannot plan a loadout (the catalogue, the goals and a solver), so the
  builder **publishes** the two totals whenever it has them (`headroom.ts`, kept in `localStorage` so it
  survives a restart) and the pill reads the latest. The figure names the inventory dump it was planned from
  and is dropped when a newer dump arrives, until the builder plans again.
- **In the section**, the Melee row is flagged and reads `AC 60 → 125`, with a sentence under the table. The
  section opens itself when any suggestion turns up, including one that arrives after it first drew.
- **In the pill**, AC comes first (`🛡 AC +65`) with `+N` for the resists behind it.

## Consequences

- **Only as good as the builder's goals.** If AC is not a goal or a weight, the loadout may reach no more AC
  than is worn and nothing is suggested, however much armour is owned. The pill does not set an AC goal for
  the player.
- **The pill needs the builder to have planned once** for the current inventory dump. After a fresh export
  it stays quiet until the builder is opened.
- The loadout may include pieces still to hunt if hunting is on in the builder; the sentence says "the
  loadout the builder planned", not "what you own".
- Replaces the 0361 line "melee is never flagged"; the rest of 0361 stands.
- Not built: setting the goal from the suggestion, naming the slots that change, and an AC-to-damage model.
