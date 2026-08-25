# 0137: A filed drop can still learn where it was

## Status

Accepted

## Context

[ADR 0136](./0136-logged-data-says-where-it-happened.md) made a drop record the zone it was looted in,
and closed with a consequence that read:

> **Only going forward.** Drops already in the ledger have no zone and never will.

**That was wrong**, and worth saying plainly rather than quietly fixing. It was reasoned from the
right premise — nothing may *invent* a zone for an old drop — and then stopped one step short: the
logs are still on disk, and a log is where the zone comes from in the first place. Re-reading one
replays its zone lines and its loot lines in the order they happened, so the zone a re-read arrives
with is **measured, not guessed**. That is a different act entirely from the backfill 0136 rejected
(deriving a drop's zone from whichever kill happened to be near it in the kill log), and it deserved a
different answer.

Everything needed was already built, and none of it was pointed at the loot ledger:

- `importLog` **already tracks the current zone** — it files kills under it, three lines from where it
  hands the drop to the ledger — and threw it away for loot.
- `reReadLogs` **already takes the loot log** and passes it to `digestLog`
  ([ADR 0129](./0129-a-release-can-ask-for-a-re-read.md)), runs after the window has painted, and is
  self-limiting.
- `loot-log` **already declares itself a data concern** with `remedy: "re-eat"`.

What actually stood in the way was one line: `add` keys a drop by its log line and returns early if it
has seen it. So a re-read reached every drop it could place and refused all of them. And that refusal
is not incidental — it is [ADR 0033](./0033-eating-a-log-is-idempotent.md), which says a drop is a
**count** and counting one twice corrupts a rate. Any change here has to answer ADR 0033, not work
around it.

## Decision

**Filling in a field a record was missing is not counting it again**, so it is allowed where a second
count would not be. `LootLog.add` returns `"added" | "placed" | "known"` and, on a line it already
holds, fills in the zone it lacked. Nothing is appended, no total moves, one row becomes better
described. ADR 0033 stands untouched for the thing it was actually about.

Three constraints keep that narrow:

- **Gaps only.** A row that already names a zone is never overwritten. Two passes over one line
  disagreeing means the *rules* moved, and preferring the newer read would make the ledger depend on
  how many times it had been re-read.
- **Reported apart.** `placed` is its own figure in `LogImportResult` and `ReReadReport`, never folded
  into `loot`. On a log whose drops were all recorded live it is the only number that moves, and a
  re-read that reported them as *additions* would look exactly like the double-counting ADR 0033
  forbids.
- **A union, not a boolean.** Every one of the three answers is truthy, so the old `if (add(...))`
  would have counted a whole re-read as new drops. The union makes that a compile error instead of a
  silent miscount.

**The zone comes from the pass doing the reading.** `importLog` stamps the drop with the zone it is
already tracking, via `lootRecord` — the one statement of "a record is the line plus its zone", shared
with the live watcher, so a drop filed by a replay is indistinguishable from one filed live.

**And it triggers itself.** `loot-log` goes to revision 2 with `unattended: true`, on the same argument
`combat-history` uses (ADR 0129): the logs are on this machine, the app knows which ones to read, and
placing a drop needs no judgement from anybody. `unstamped: 1`, because a ledger written before
stamping has no zones for exactly the reason a stamped revision-1 one doesn't. The next start does it,
after the window has painted, and the re-stamp means the start after that finds nothing to do.

Rejected alternatives:

- **Leave it forward-only.** What 0136 said. It abandons a column the app can genuinely fill for the
  months of play a player still has logs for.
- **A second public method, `place(key, zone)`, beside `add`.** Honest about intent, and it puts the
  "have I seen this line?" decision in two places — the one piece of ADR 0033 that must not be
  duplicated. `place` exists, but as a private helper `add` calls once it already knows the answer.
- **Make `add` idempotent by re-writing the row wholesale.** Simplest to describe, and it lets a later
  parse silently replace a fate, a price or a quantity that was read correctly the first time. The
  narrow "fill a gap" rule is the whole safety argument.
- **Give a drop a `logFile`, so the ledger can name its own sources.** The principled fix for the
  coverage gap below. It is a field on every one of 20,000 rows for the benefit of one repair, and the
  overlap between "logs with fights" and "logs with drops" is very nearly total.

## Consequences

- **The Loot tab's zone column fills in from the back**, for every drop still covered by a log file on
  disk. Two limits, both honest and both visible as a blank: a drop looted **before the log's first
  zone line** has no zone to be placed with, and a drop whose **log file is gone** can never be
  reached. This is the "at least *some*" that was asked for, and it is bounded by what EverQuest still
  has on disk rather than by anything the app chose.
- **The sources are the fight history's** (`history.sources()`), because a drop is not stamped with the
  file it came from. In practice the same logs — you looted where you fought — but a log that recorded
  drops and no fights at all is a gap, and its drops stay unplaced until somebody eats that file by
  hand. The Settings button does exactly that, and now reports how many it placed.
- **It runs once, unprompted, and says nothing beforehand.** A player who never opens Settings gets
  the column filled in anyway. The debug log records what it came to.
- `LootLog.add`'s return type changed, which is a compile error at every call site rather than a
  behaviour change at any of them — deliberately, per the union above.
- A re-read is now worth running for a reason that has nothing to do with fights, which makes
  `placed` the first figure in the import result that a log with no combat in it can move.
- **The ledger's line index became a map to the record**, where it was a set of keys. The lookup a
  re-read needs is the row, not its presence, and finding it by scanning would have been
  O(drops in the log × drops in the ledger) — a couple of thousand loot lines against a ledger of
  twenty thousand is tens of millions of key builds *per file*, which would have made an unattended
  repair the slowest thing about a start. Same order of memory, and the membership test it already did
  is unchanged.
