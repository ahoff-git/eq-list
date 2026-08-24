# 0033: Eating a log is idempotent — every kill and drop is keyed by its line

## Status
Accepted

Extended from kills and drops to fights by
[0055](./0055-eating-a-log-fills-history.md), and narrowed by
[0128](./0128-a-fight-is-re-derived-not-refused.md): a kill and a drop are **counts** and a second
reading is still dropped on sight, while a fight is a **derived summary** and is re-derived.

## Context

"Eat a log" (`electron/log-import.ts`) deliberately does what live watching refuses to
([ADR 0030](./0030-history-is-not-news.md)): it reads an old log from the top and digests it into
the kill log, which feeds the heatmap and observed drop rates ([ADR 0023](./0023-kill-heatmap.md),
[ADR 0024](./0024-mob-knowledge.md)). That makes duplication easy to cause and easy to miss:

- eat the same log twice;
- eat a log you had already watched live;
- eat two logs that overlap in time.

Each records the same real kills again. Kill *counts* double, and — worse — the drop reconciler,
seeing a corpse that already holds the item, concluded the mob had dropped a **second** one and
inflated the rate above what actually happened. A drop rate is a numerator over a denominator; a
replay corrupts both. Records were identified only by a random `id` minted at ingestion, so there
was nothing to notice a line had been seen before.

## Decision

**A recorded event's identity is the log line behind it, not a fresh id.** A kill is keyed
`timestamp | mob | killer`, a drop `timestamp | item | source` (NUL-joined, mob/item lower-cased).
The same line always produces the same key, so the second reading is recognised regardless of how
much later it comes or which path fed it.

- `record()` and `noteLoot()` skip a key they've already seen and **return whether they added**,
  so the importer counts only genuinely new events — re-eating a log reports `0 kills / 0 drops`.
- Keys are stored on the record (`key`, `dropKeys`) and re-indexed on load, so idempotency
  survives a restart. Records written before keying are **backfilled** with a kill key on load, so
  old live-watched kills also dedup against a later import.
- Loot has no key to backfill (the loot line's own timestamp wasn't kept). So a corpse that
  already holds an item and carries **no** `dropKeys` is treated as a pre-keying record whose drop
  is being replayed, and is left alone; only a corpse we have been keying is trusted to have
  genuinely dropped a second one. Everything recorded from now on is fully keyed either way.

The key is intrinsic to the line, not to store state, which is what keeps it idempotent: counting
"how many like this exist already" would make a second import assign fresh indices and duplicate.

## Consequences

Eating overlaps freely — re-eat a log, eat one you watched live, eat two that overlap — and each
real event lands once. The natural cost is granularity: two genuinely distinct events that share a
whole key (the same mob killed by the same person in the *same logged second*, or the same item
looted from the same corpse in the same second) collapse to one. At EQ's one-second stamp that is
rare and, for a rate over hundreds of kills, negligible — the honest trade for never double-counting.

Reconciling data recorded *before* this decision is best-effort: kills backfill cleanly, but a
pre-keying corpse won't accept a legitimate second drop of an item it already shows. Anyone wanting
a fully clean slate can `clear()` and re-eat their logs, which is now safe to do repeatedly.
