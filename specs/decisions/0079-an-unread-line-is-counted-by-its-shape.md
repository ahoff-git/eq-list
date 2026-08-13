# 0079: An unread line is counted by its shape

## Status

Accepted

## Context

Every matcher in `parse-line.ts` returns null for lines it doesn't own, and a line nothing owns is
dropped in silence. Our tests pin the grammar we already thought of — which is exactly why they
can't find the wordings we haven't. `log-parser.test.ts` carries the evidence: lines that "were
silently unparsed (or under-counted) before", found because somebody happened to look at a log.

The same failure has bitten in a bigger way. `stance` and `invocation` parsed fine but were absent
from the watcher's hand-maintained list of combat kinds, so nothing listened, and the whole of
[ADR 0020](./0020-split-by-stance-and-invocation.md) sat dark against a log containing 243 of those
lines. Silence is the app's default response to not understanding something, and that is the bug.

A neighbour keeps every unrecognised line in an `unmatched` bucket behind a diagnostics tab, and
its architecture doc calls that "the calibration loop that has driven most parser fixes"
(`eql-log-reader`, see [neighbours.md](../neighbours.md)).

The obvious objection is privacy. A raw log line can hold another player's name and, worse, their
words — chat, tells, guild traffic. A diagnostic that quietly accumulates those is not one we want
on disk or in a bug report.

## Decision

**Count what we couldn't read, by shape, and never keep what anyone said.**

- **Two buckets.** Lines that are somebody talking — tells, says, channels, other players' emotes
  — are *matched and ignored*: counted so the totals stay honest, then discarded without their
  text. Everything else is tallied. Without that split an evening of guild chat buries the one
  line that reveals a gap, so the second bucket is what makes the first readable.
- **Shape, not line.** Digits fold to `#`, so a thousand damage amounts collapse to one row. The
  folding is deliberately conservative — only digits — because anything cleverer risks merging two
  genuinely different wordings and hiding the very gap this exists to find.
- **Capped, and it says so.** A full table stops taking new shapes rather than evicting, since
  what is already there has proven frequent; the count of what it turned away is reported, so a
  truncated list is never mistaken for a complete one.
- **Debug-gated output.** The tally is printed through `logging.ts` after a replayed gap — the
  best sample we get, a whole evening at once — and nowhere else.

**What this does not claim.** Names are *not* folded. Removing them reliably needs a roster we
don't have, and removing them unreliably merges lines that differ. So the honest position is: the
bulk of other people's words are gone because they were never kept, what remains is sentences the
**game** wrote, and a shape should be read before it is pasted anywhere.

## Consequences

- A parser gap becomes findable from ordinary play, without asking anyone to send a log.
- The ignore list is now a thing to maintain: a chat form we don't recognise shows up as a
  parser gap. That is the right failure — noise in a debug list, visible, rather than silence.
- Run-scoped, not per file: a wording we can't read is a fact about the grammar, not about which
  character produced it.
- Relatedly, and for the same reason this ADR exists, the two hand-maintained lists of "which
  kinds are combat" (the watcher's and the importer's) are replaced by one `isCombatEvent` in
  `parse-line.ts`, typed as a total map so **omitting a new kind is a compile error** rather than
  a silence. Two copies could also have drifted from each other, which would have made the same
  evening read differently live than re-imported — see
  [ADR 0033](./0033-eating-a-log-is-idempotent.md).
