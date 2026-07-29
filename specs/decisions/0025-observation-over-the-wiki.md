# 0025: Observation outranks the wiki, and disagreements are shown

## Status
Accepted

## Context
[ADR 0003](./0003-eqlwiki-runtime-data-source.md) made eqlwiki the app's data source, and it's
still the right starting point — it knows about items and quests we'd otherwise have to
discover one kill at a time. But it describes an **older, since heavily modified game**. Its
drop rates are someone else's sample of a different build, and its loot lists are missing
things the current game does.

That isn't a hypothetical. Reconciling the wiki's fixtures against a real kill log:

```
minotaur slaver — wiki lists 16 drops, you killed it 4 times
   undocumented  Minotaur Battle Axe +1     25% (observed)
   undocumented  Minotaur Blood             25% (observed)
   unseen        Amber                     1.3% (wiki)
```

Both items the mob actually dropped are **absent from the wiki entirely**. The `+1` suffix is
the sort of variant a modified build introduces and an old reference never had.

Meanwhile our own data has the opposite problem: it's this build, but the sample is tiny. Four
kills is not a drop rate, and a small sample presented confidently is its own kind of lie.

## Decision
**Neither source wins outright; the disagreement is the product.** `src/shared/drop-truth.ts`
puts them side by side and names what it finds:

- **confirmed** — the wiki lists it and we've seen it.
- **undocumented** — we've seen it and the wiki doesn't list it. The most valuable row on the
  screen: something this build does that no reference knows.
- **unseen** — the wiki lists it and we never have. Meaningless after three kills, damning
  after two hundred, so it carries the kill count and is only flagged **suspicious** past a
  threshold.

**Which rate leads depends on the sample, and the badge says which you're reading.** Under 15
observed kills the wiki's figure is the better guess; past that our own takes over and is marked
`✓`. With no wiki figure at all, even a thin observation beats nothing. The hover always states
the provenance — "seen 3 times in 20 of your own kills; the wiki says 8%".

This inverts the earlier default without discarding it: the wiki seeds the app (what exists,
what a quest needs, which zones matter) and observation corrects it where they disagree.

Rejected alternatives:
- **Trusting the wiki and treating our kills as trivia.** The data above is the argument
  against; two of two real drops were undocumented.
- **Trusting observation immediately.** A 1-of-1 drop reads as 100%, which is worse than the
  wiki's stale-but-broad figure.
- **Silently preferring one and hiding the other.** The interesting information *is* the
  disagreement — a wiki claim unseen in 200 kills tells a player something, and so does a drop
  no reference lists.
- **Averaging the two.** They're samples of different games; the mean of a stale rate and a
  fresh one describes neither.

## Consequences
- The Hunt tab's rates improve as you play and jump when a group pools observations
  ([ADR 0024](./0024-mob-knowledge.md)) — and it visibly stops trusting wiki claims that keep
  failing to appear.
- Undocumented drops surface automatically, which makes the app a way of *discovering* what the
  modified game changed rather than only consuming what's already written down.
- Thresholds (15 kills to lead, 25 to call a claim suspicious) are judgement calls, deliberately
  low enough to be reachable in a session and high enough that one lucky drop can't rewrite a
  rate. They're constants in one file.
- The wiki stays the source for everything observation can't supply: item cards, quest
  components, zones, which mobs exist at all.
- Two sources means two ways to be wrong, and the UI now has to say which is speaking. That's a
  cost in labels, paid deliberately.
