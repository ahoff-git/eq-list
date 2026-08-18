# 0096: Stored data says which rules wrote it, and a revision is not a build number

## Status

Accepted

## Context

The app derives almost everything it knows from the log, and the rules for reading it keep improving.
[ADR 0095](./0095-your-own-dot-tick-is-yours.md) is the case that forced the issue: a parser fix
raised every damage figure that includes your own damage-over-time ticks, and was explicitly
forward-only — so a thousand banked fights now under-report by a few percent, and **nothing on disk
says so**. They don't look broken. They look like measurements. That is the worst way for data to be
wrong, and it is a shape this app has ruled on repeatedly from the other direction: show the doubt
([ADR 0023](./0023-kill-heatmap.md)), say what a figure is worth
([ADR 0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md)), never let absence read as zero.

Four version markers already existed, each invented where it was needed and none able to answer this:

| marker | where | what it does |
|---|---|---|
| `schema: 2` | `kill-log.json`, via `migrations.ts` | gates a one-time repair |
| `schema: 1` | `settings.json`, via `migrations.ts` | gates a rule conversion |
| `CACHE_VERSION = 12` | wiki page cache | invalidates a mirrored page |
| `GAZETTEER_VERSION` | zone-names cache | re-scans a map folder |

Meanwhile five stores carry no marker at all, and the two committed generated datasets (the travel
graph, the zone/expansion table) record nothing about what built them or when — which is what makes a
stale one mysterious rather than diagnosable, as `todo.md` had already noted by reading a neighbour's
provenance manifest.

## Decision

Every store writes a **`provenance` stamp**, and one shared table
([data-provenance.ts](../../src/shared/data-provenance.ts)) says what bodies of data exist, what
revision each is at, and what to do when the two disagree.

**A revision is per concern, and is not the app version.** This is the load-bearing decision and the
one that is tempting to get wrong. CI stamps a build number into every push to `main`
([ADR 0064](./0064-every-build-has-a-number.md)), so `0.1.41` becomes `0.1.42` for a CSS change.
Comparing app versions would mark **every store stale on every build**, which trains you to ignore the
flag — the same failure [ADR 0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md) avoided by
refusing to celebrate a fresh scoreboard's first eight records. So the compared number is a revision
per concern, bumped by hand when the rule that produces that data actually changes, and carrying a
`changed` sentence so the flag says *what* changed. The app version rides along in the stamp but is
never compared: it is the answer to "which build wrote this?" in a bug report, and nothing else.

**A revision is not a schema, either.** They look alike and answer opposite questions:

- a **schema** (`migrations.ts`) is something the app can repair **by itself, at launch, silently**.
- a **revision** is something the app **cannot** fix on its own — re-reading a log, re-running a build
  script, refetching the wiki — so the honest move is to say so and let a person decide.

A file carries both, and that is not redundancy: one drives an automatic repair, the other drives a
prompt, and bumping either does nothing to the other.

**Stamped in `writeJson`, not by each store.** One line in the shared writer and one word per store,
because a store that forgot to stamp would look permanently current — and a silently wrong "up to
date" is worse than no flag at all.

**The stamp is written first.** `JSON.stringify` emits keys in insertion order, and the reader finds
the stamp by reading a **window from the head of the file**, because a real fight history is megabytes
and a report about it must not cost megabytes of parsing. This was got wrong first time (the spread put
the stamp last) and the symptom was every large store declaring itself stale for ever; both halves of
the pact are now commented and one test pins it.

**An unstamped file is assumed current**, unless its concern says otherwise. The day stamping ships
nothing on disk has a stamp, and flagging every store at once would be noise about data that really is
fine. `combat-history` and `high-scores` are the two exceptions, and they are honest ones: ADR 0095's
bump predates stamping, so their unstamped data genuinely is a revision behind.

**Data from a newer build is `ahead`, not `stale`, and is offered nothing.** A downgrade must never be
invited to rebuild newer data with older rules; that would quietly replace the better answer with a
worse one, which is the hazard [ADR 0031](./0031-an-inferred-bound-must-be-able-to-fall.md) guards from
the opposite direction.

**A remedy names who can act**, and the panel only offers a button for the two the app can carry out
itself (re-eat a log, refetch the wiki). `script` prints the command, `rescan` says there is nothing to
do, and `unrecoverable` says so plainly — a peer's observations were never ours to re-derive. A remedy
nobody can act on is not counted in the badge, or it would be a count you can never clear.

## Consequences

**Settings → Recorded data** lists every body of stored data with its state, what it is, what changed,
and the one thing worth doing. It shows the current rows too, not only the stale ones: a panel that
renders nothing when all is well is indistinguishable from a broken one, and "all current" is the
answer you came for half the time.

Ten concerns are registered. Two report stale on an existing install — recorded fights and the
scoreboard seeded from them — which is exactly ADR 0095's debt made visible instead of silent.

**A bug found on the way, and fixed here.** `kill-log.ts` never read or wrote `schema`, so the first
save after a migration **deleted the migration's stamp**. The migration then found an unstamped file
next launch and re-read *every log in the folder* — 19 MB on the author's install — to repair nothing,
at every launch, for ever. The store didn't own the field but did own the file, which is the general
rule now stated in that file and pinned by a test: **a store must write back fields it doesn't own.**
It is also the exact failure this ADR's "stamp in the shared writer" decision exists to prevent, found
by going looking for it.

Bumping a revision is now a deliberate, cheap act with a visible consequence, which makes the
forward-only choice in ADR 0095 defensible rather than merely convenient — the debt is on screen.

Two things this does **not** do, both already in [todo.md](../todo.md) and neither made worse:
re-deriving stored fights from their source lines (this flags the need; the machinery is still absent),
and stamping the committed generated datasets from their build scripts (they are registered as
concerns with their command, but their state can only be asserted, not computed — the honest report is
the command rather than a verdict).
