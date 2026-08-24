# 0100: A setup check is a chain, and it names the first broken link

## Status

Accepted

## Context

Everything the app does hangs off one thread: a **folder** → a **log file** in it → a **watcher** on
that file → **lines** in the shape we read → **events** we understand. When any link in that thread
breaks, every symptom is identical — the shopping list never lights up, the damage meter stays at
zero, no alert ever pops, the map never follows you. The causes are not identical at all:

- the log folder points somewhere that no longer exists, or that we can't list;
- `/log on` was never typed for **this character** (EverQuest remembers it per character, and writes
  no file at all until it is);
- a **pinned** log file in Settings was deleted or renamed, so we follow nothing;
- the folder is some other game's, or the file isn't an EQ log, so no line carries a timestamp;
- the app is following a perfectly healthy log — belonging to a character you aren't playing.

Nothing on screen tells these apart. The status hint under the log folder says `Not watching` or
names a file, which answers one of the five. So the only tool anyone had was to change a setting and
wait to see whether anything happened, and the report that reaches us is always the same
unanswerable sentence: *"it doesn't do anything."*

The obvious shape — a checklist that runs every check and shows a row per result — makes this worse
rather than better in the common case. One missing folder fails the folder check *and* the file
check *and* the watcher check *and* both log-reading checks *and* the character check: six red rows
for one fault, with the actual cause buried at the top of a list that reads as catastrophe. A panel
that overstates gets ignored exactly like a panel that says nothing.

## Decision

The check is a **chain**, not a checklist. Each step declares what it `needs`, and a step whose
prerequisite failed is **not run** — it reports `skip`, naming the step it's waiting on. One red row
and five *"not checked — the log folder has to be right first"* is a diagnosis; six red rows is
noise.

Four rules follow from that, and they are the whole design:

- **Chain order, not severity order.** Rows show in dependency order, so a reader scanning down
  stops at the first thing that isn't green and everything below it is either a consequence or a
  separate concern. Sorting by severity would destroy exactly that reading.
- **The verdict names the first problem, not the worst.** In a chain the first is the cause.
- **A warning does not block.** `warn` means "working, but worth knowing" (the log is a day old; the
  wiki is unreachable; your list is empty) and downstream steps still run — treating an advisory as
  a blocker would hide real faults behind it.
- **Every step says what it found, on a pass too.** `Following eqlog_Kainos_pq.proj.txt` is a green
  row nobody would think to ask for, and it is the sentence that solves the fifth case above.

The judging is pure and shared ([self-check.ts](../../src/shared/self-check.ts)): the step table,
the skip rule, the verdict and the pasteable report. The looking is one probe per step in
[electron/self-check.ts](../../electron/self-check.ts), with the filesystem the only thing it
touches directly — the network and the windows are injected, so the whole thing is testable against
a temp folder with no Electron and no wiki.

It runs **on demand only**. It reads the disk and pings the wiki, and the value of the answer is
that it was gathered *just now* — after whatever the user changed a moment ago. A cached verdict
from tab-open would be worse than none.

## Consequences

- The support conversation changes shape: "press Check my setup and paste what it says" replaces a
  round of guesses. **Copy report** exists for that, and includes the advice each row gave — which
  is what the reporter has most likely already tried.
- A probe that **throws** is a failed row carrying the error, never an exception out of the run.
  This is the button people press when things are already broken; returning nothing would be the one
  outcome with no diagnostic value at all.
- Adding a check is a row in the table and a probe beside it. Nothing else changes, and the tests
  pin the *rule* against a made-up three-step chain rather than the shipped one, so the catalogue
  can grow without rewriting them.
- Some rows are amber for things that are nobody's fault and no fault at all: alerts switched off, a
  log last written yesterday, an empty shopping list. That is deliberate — this panel is read when
  something *isn't happening*, and "you switched them off" is the most useful sentence it can say.
  The wording carries the *if* ("if you're in game right now…") so a check run from the desktop
  doesn't read as an accusation.
- It reports; it never repairs. Every remedy is a sentence pointing at a control that already
  exists, which is the same division [ADR 0096](./0096-stored-data-says-which-rules-wrote-it.md)
  drew for stored data: a panel that can only describe the situation can only ever describe it
  wrongly.
- It is **not** a health monitor. It says nothing about whether it was right five minutes ago and
  raises no notification of its own — if a standing "something is wrong" indicator is ever wanted,
  that is a different feature built on the same probes.
