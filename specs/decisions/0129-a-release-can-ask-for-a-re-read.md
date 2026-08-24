# 0129: A release can ask for a re-read, and the next start does it

## Status
Accepted

## Context
[ADR 0128](./0128-a-fight-is-re-derived-not-refused.md) made "digest the log again" actually redo a
stored fight, and then left the trigger where it found it: a person pressing a button. That was the
right place to stop for one release and the wrong place to leave it, for a reason that is worth
stating plainly — **the user never chose to have the data wrong.** A parse rule improved, their
figures went stale as a side effect, and asking them to press a button to undo our change is a chore
dressed up as consent.

`data-provenance.ts` argues the opposite, and it argues it well: a *schema* is something the app can
repair by itself at launch, while a *revision* is "something the app **cannot** fix on its own.
Re-reading a log, re-running a build script or refetching the wiki are all either slow, destructive,
or a developer's job — so the honest thing is to *say so* and let a person decide."

Two of those three still hold. The third does not, and the reason is measurable: re-reading a log is
**not** a job for anybody else. The logs are on this machine, `CombatHistory.sources()` knows which
files the fights came from, and a full pass over the largest real log — 26 MB, 315,601 lines, through
the parser and every store — takes **1.4 seconds**. That is not "slow" in the sense the argument was
about; it is slow in the sense that it must not happen on the launch path.

So the distinction that actually matters isn't *schema versus revision*. It is **can the app finish
the job with what it already has?** Where it can, asking is noise.

## Decision
**A concern may declare itself `unattended`, and a start that finds it stale puts it right without
asking.** For `combat-history` that means re-reading the logs its fights came from, after the window
has painted.

## Consequences
- **`DataConcern.unattended`** marks a remedy the app may run itself. Set on `combat-history` and
  nothing else: `refetch` needs a network and somebody's patience, `script` needs a checkout, and
  `unrecoverable` is the case where nobody can help. A release that changes how a log is read bumps
  the revision, and that is the whole of the release's part.
- **`electron/log-reread.ts`** does it. Three properties, each load-bearing:
  - **It reads the sources the history names**, not the log folder. Only the files a fight came from
    can change anything by being re-read; digesting whatever else is lying in the folder would fold
    other characters' evenings into a store nobody asked about.
  - **It yields between files** (`setImmediate`), so a player with several characters gets one 1.4
    second pause per log rather than their sum. Chunking *within* a file would be better and is not
    yet worth the restructuring; if a 100 MB log ever turns up, that is where to look.
  - **It is self-limiting.** Putting the data right re-stamps the file at the current revision, so the
    next start finds nothing to do. There is no "we tried" flag, for the same reason `log-cursor.ts`
    keeps a position rather than a bit: the data is the record.
- **It runs from `afterLoad`**, the hook that already exists for "started once the control window has
  painted". Nothing about it is on the launch path, and it is fire-and-forget: `reReadLogs` never
  throws, because a repair that takes the app down is worse than the figure it was fixing.
- **A source that has gone is skipped, and the concern stays stale.** That is the honest state, and
  the Settings panel goes on naming the remedy for a person who can point at the right folder. The
  fights from that log keep their figures and say so (`unsourced`, ADR 0128).
- **A recorded path is resolved by name against the folder we watch now.** A history carried between
  machines, a reinstall on another drive, a moved Logs folder — the file *name* is the durable half,
  exactly as it is for a fight's own identity.
- **`digestLog` is shared** by the button and this, because the two must do the identical dance with
  the kill log's character name. The kill log tells your own kills from a stranger's by that name, so
  a path that forgot to set it would file somebody else's evening as yours — and a bug nothing would
  report.
- The scoreboard is re-offered afterwards, silently, on `absorb`'s own contract: an evening's records
  being recomputed is not news.
- **`combat-history` is at revision 3.** ADR 0126 changed what falls inside a fight, so fights stored
  before it really are out of date — and this is the first bump whose remedy runs itself.
