# 0133: The log is an index, and the rules live in one consolidated file

## Status
Accepted

## Context
This folder reached 131 records. Three things had gone wrong with it, and all three were the same
kind of failure: the folder had stopped being readable as a whole.

**The log had become a second copy of every decision.** [ADR 0001](./0001-record-architecture-decisions.md)
says a new ADR "adds a line to the `## Log`". In practice each entry had grown a multi-sentence
italic annotation explaining the decision and its relationship to its neighbours — so
`README.md` was **189 KB across 333 lines**, longer than most of the records it indexed, and it
restated their reasoning in words that could drift from them. An index you cannot scan is not an
index, and a second telling of a decision is a second thing to keep true.

**There was nowhere that said what the app is supposed to do.** A record argues one decision at one
moment. Answering "what rule is in force about zone names?" meant reading 0057, 0059, 0068, 0075,
0076 and 0083 and working out which parts of each survived — and the same principle kept being
argued again from a new direction: *discard, never clamp* is stated in 0031, 0092, 0097, 0107, 0121
and 0132. That repetition is honest as history and useless as a specification.

**Numbers had collided.** 0105 and 0120 were each issued twice, by two pieces of work landing the
same afternoon: both authors read the log, saw the same highest number, and took the next one. The
same near-miss happened again during this cleanup — 0129 and 0130 had been claimed by in-flight code
whose records were not yet written, so a renumbering that reached for "the next free number" would
have collided a third time.

Alongside those, the folder had drifted mechanically: twenty records whose `# NNNN:` heading was
missing, misnumbered or punctuated differently; six with sections in the wrong order or under the
wrong name; thirteen whose supersession was recorded only in the log and not in their own `Status`,
so reading the record told you nothing about whether to believe it.

## Decision
**The log is an index. [requirements.md](./requirements.md) is the specification. A record is the
argument.** Three files, three jobs, and no rule stated in more than one of them.

- **A `## Log` entry is one line** — `[NNNN: title](./NNNN-….md)`, taken verbatim from the record's
  own heading. It may carry a short italic note **only** where the record's standing has changed
  (superseded, partly reversed, extended), because that is the one thing a reader needs before
  deciding whether to open it. Reasoning goes in the record.
- **[requirements.md](./requirements.md) states every rule still in force, once**, grouped by area,
  each citing the records it came from. Superseded records are not cited: a rule a later decision
  reversed is not a rule. Where the two disagree the record wins and the requirement is a bug.
- **A supersession is stated in the superseded record's own `## Status`**, not only in the log — with
  a sentence saying which part fell and which part stands, since most of these are partial.
- **A number is claimed when the file is created**, not when the work is finished. This is the whole
  fix for the collision: the file on disk is the lock.
- **A collided number is resolved by moving the *later* record to the end of the sequence.** The
  earlier one keeps the number. That is the direction that leaves the most existing citations
  correct — code comments say "(ADR 0105)" with no link, and the older record has had longer to
  accumulate them.

Records are **not** merged, split or rewritten to remove the repetition. ADR 0001 says an accepted
decision is superseded rather than edited, and the repetition is *evidence* — the sixth independent
arrival at "discard, never clamp" is the argument for it being a rule. Consolidation happens in a new
file that cites them, which costs nothing and destroys nothing.

## Consequences
- `README.md` drops from 189 KB to about 28 KB, and its Log is scannable in one screen-scroll.
- `requirements.md` is a new thing to keep current, and it will rot if a new ADR does not add its
  rule. That is the cost, accepted deliberately: the alternative is that nothing states the rules at
  all. Adding the rule is now part of writing a record, alongside adding the log line.
- All 131 records now share one shape — `# NNNN: Title`, then `Status` · `Context` · `Decision` ·
  `Consequences` — so the folder can be checked mechanically. The `## See also` sections on 0004 and
  0124 folded into their `Consequences` as ordinary links.
- 0105 → **0131** and 0120 → **0132**; every link, label and bare prose citation moved with them.
  0129 and 0130 belong to the in-flight work that had already claimed them.
- The numbering is now non-chronological at the tail: 0131 and 0132 are older than 0129 and 0130.
  A number is an identifier, not a date, and the mtimes and git history carry the chronology.
- Two open questions were settled by later records and removed rather than left standing
  ([0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md) on a zone's difficulty needing a
  field of its own; [0128](./0128-a-fight-is-re-derived-not-refused.md) on whether a stored fight
  should be re-derivable), and one was narrowed to the part
  [0124](./0124-lucy-is-a-second-opinion.md) left open.
- A reader arriving cold now has an obvious route: [specs/README.md](../README.md) → this folder's
  [requirements.md](./requirements.md) → the record behind whichever rule surprised them.
