# 0155: A fade carries the sentence, not the line

## Status

Accepted

## Context

A buff leaving **you** names no spell. EQL prints per-spell flavour text instead — `The spirit of
wolf leaves you.`, `Your strength fades.`, `Your skin returns to normal.` — which is the entire
reason [ADR 0080](./0080-the-game-s-own-spell-file.md) reads `spells_us_str.txt` at all: the file
maps those sentences back to the spells that write them.

`BuffFadedEvent` carried `raw`, and the tracker looked the fade up with it. `raw` is the **whole log
line**, timestamp included:

    [Tue Aug 04 13:22:42 2026] Your skin returns to normal.

The index holds sentences. So the lookup matched nothing — not sometimes, **never**. Replaying a real
372,004-line log: 395 fade-on-you lines, 237 of them sentences the file knows, and **every one
returned zero candidates**. The 43 MB lazy read was being paid for and thrown away one call before
it was used.

Nothing looked broken from the outside. A fade that matched nothing logged `unattributed fade` at
debug and returned, which is also the honest behaviour when there is no game install — so the failure
wore the costume of the case it was supposed to be distinguished from.

**And the test suite agreed with the bug.** The harness built its fade events by hand and put the
bare sentence in `raw`, because that is what the lookup wanted. Production and the tests were reading
two different fields and both were internally consistent.

## Decision

**The fade event carries `message` — the line without its timestamp — and the lookup uses it.**

- `message` sits on `BuffFadedEvent` beside `raw` rather than being re-derived by the reader. This is
  the one event whose *text* is a lookup key, and the parser is already holding the split line.
- `raw` stays, unchanged, for the log and for anything that wants the line as written.
- **The harness stamps its fakes.** `fade()` builds `raw` as `[Thu Aug 20 20:00:00 2026] <sentence>`,
  the way the parser really hands it over. A test double that is easier to satisfy than the real
  thing is not a test double.

## Consequences

The half of the feature that answers *your own buffs* works. On the same log: 209 more fades
attributed immediately, and "Up now" stopped being a month-long graveyard of buffs that had no way
to come down.

**A silent miss is the dangerous shape**, and this one hid for as long as it did because "no
candidates" is a legitimate answer. The type now makes the mistake unavailable rather than the
comment warning against it — passing `raw` to `fadedBy` no longer compiles into anything meaningful,
because the field that means *sentence* is called `message`.

**Found by replaying a real log through the real tracker**, not by reading the code. Every unit test
passed before and after the bug existed; nothing short of real sentences meeting the real index could
have shown it.
