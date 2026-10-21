# 0313: A guide step knows what you already hold

## Status
Superseded by 0314

## Context
The tradeskill guides say what each step uses, how many combines it takes and where to buy it
([ADR 0303](./0303-a-tradeskill-guide-follows-your-skill.md),
[ADR 0304](./0304-a-guide-section-says-what-it-costs-and-where-to-buy-it.md)). They didn't know what
the player already had. The inventory dump now covers bags, bank, Tradeskill Depot and Dragon's
Hoard, and peers can share theirs ([ADR 0309](./0309-an-inventory-is-shared-live-and-judged-by-the-receiver.md)).
The ask (2026-10-20): cross-reference the guides with your banks and your peers', and gently suggest
other recipes your materials already cover, for comparable skill-ups.

## Decision
- **Per material**, each step's estimate shows how many you hold (green once it covers the high
  estimate, amber when it's only some), and which peers hold some. Each section's summary lists what's
  already in your bags or bank, above where to buy the rest.
- **Alternatives are other guide steps, not new recipes.** At your current skill, any step from any of
  the skill's guides whose span covers it is an equal skill-up by the guides' own reckoning. They're
  ranked by how many combines **your own** materials cover. The scarcest per-combine material decides;
  a one-off purchase for the whole step (a mould, a tool) doesn't limit combines. Peers' holdings are
  shown but never counted, since another person's bank is a favour to ask, not a material in your bags.
- The aside is **silent unless one of them uses something you hold**, lists at most three, never
  suggests an out-of-era step, and sits under your skill line rather than rearranging the guide.

## Consequences
- With a dump taken, a step's "×12–20 Silver Bar" reads "· have 9", and a skill page can say
  "Silver Cat Eye Necklace, enough for ~8 combines" before you set out to buy something else.
- The figures are only as fresh as the dump. Loot since then isn't counted, the same limit everywhere
  the dump is used.
- "Comparable" means *the guides put both steps across your skill*. Two steps covering the same span
  may differ in pace or trivial; the guides don't say how much, so neither does this.
- Item names must match between the guide's materials and the dump (grades and case are folded). One
  that doesn't simply shows no holding.
