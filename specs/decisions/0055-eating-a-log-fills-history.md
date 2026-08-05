# 0055: Eating a log is a catch-up — it fills every bucket it can

## Status
Accepted

## Context
"Eat a log" digested a past log into the kill log — kills, drops, coin, positions — and
deliberately stopped there. The reasoning, written into `log-import.ts`, was that combat stats
describe your *live* session and folding an old night into "this session" would be a lie.

That reasoning is sound and the conclusion was too broad. History is not "this session": it is
exactly the place a past evening belongs, and the Damage tab now groups it by sitting
([ADR 0054](./0054-a-sitting-is-a-login.md)). So the app could tell you the drop rate of a mob you
killed a fortnight ago but not what the fight looked like — even though the log it just read
contains every line needed, and the tracker that turns those lines into fights is a pure function
of them.

The same was true of the loot feed, for the same reason: it was described as "what's dropping
now", so eating a fortnight of logs left the Loot tab empty and the vendor prices derived from it
unlearned.

Filing any of it raised the duplication problem [ADR 0033](./0033-eating-a-log-is-idempotent.md)
already solved for kills and drops, in a form it hadn't covered: eat a log you watched live and
every evening appears twice.

## Decision
- **The importer runs a combat tracker of its own.** Not the live one — an old evening's damage
  must not land in the meter you're looking at. It's fed the same events `main.ts` feeds the live
  tracker, so an eaten fight is indistinguishable from a watched one: damage cells, spells,
  deaths, per-mob rates, zone.
- **`onFightEnd` → `history.add`, under the sitting the log names.** The importer follows the
  log's login lines and passes the resulting session id explicitly, so eaten sittings group like
  live ones and the live session in progress is never re-pointed. Fights before the log's first
  login fall under a `file:<path>` id rather than borrowing the live session's.
- **A fight is keyed by the log behind it**, extending ADR 0033's rule from kills and drops to
  fights: `basename(logFile) | startedAt | endedAt`. Both timestamps are the log's own clock, so
  the same fight recognises itself however it arrives — re-eaten, or eaten after being watched
  live. `add()` returns whether it was new, so the result line counts only genuinely new fights
  and a second helping reports `0`. Keys are rebuilt on load, including for fights stored before
  keying, whose key is computed from the fields they already carry.
  - The *basename*, not the path: the same log is reached by different paths (a copy, a mapped
    drive), and the name carries the character — which is what keeps two characters' logs of the
    same minutes from cancelling each other out.
- **The 1000-fight cap drops the oldest by the log's clock**, not by when we happened to file it.
  Eating a past log appends fights older than everything already stored, so insertion order stopped
  meaning chronology; `fights()` sorts by time for the same reason.
- **The loot feed takes eaten drops too.** It was "what's dropping now", which is the wrong frame
  for a catch-up: the feed *is* the loot history, and a log the app wasn't running for belongs in
  it as much as tonight's does. Safe to do twice because a drop is keyed by its log line — which
  it now is, and which also protects the vendor prices derived from it
  ([ADR 0056](./0056-a-dropped-record-keeps-what-it-taught.md)).
- **What eating still won't touch, and why.** The **live meter** (an old evening is not this
  session); **experience and health** (`xp-progress`, `hp-estimate` describe the character *now*,
  and an old log describes an earlier, weaker one — feeding it would rewind them); and the
  **shopping list** (its counts are a to-do the player curates, so crediting a fortnight-old drop
  would silently tick off items long since handed in). Everything else the log can teach lands.
- **`dataChanged` is broadcast after an import** (and after a clear). Tabs that read a stored list
  once when they open — the fight history, the loot feed — refetch on it; live events say nothing
  about a whole file changing underneath. Without it a freshly eaten fortnight only appeared after
  a reopen.

Rejected alternatives:
- **Feeding the live tracker.** One less object, and it puts last month's damage in tonight's
  meter — the very thing the original note refused, correctly.
- **Keying a fight by its `logIds` line span.** Already on the fight, and meaningless across runs
  (ADR 0021 says so) — the timestamps are the durable identity.
- **Re-deriving history from scratch on every import** (clear, then re-eat). Simple, and it throws
  away every fight whose log has since rotated away.

## Consequences
- Eating your logs is a real catch-up: measured on a real 7.8MB log, in **330ms** — 1,510 kills,
  1,077 drops, 51,881 copper, **560 fights across 12 sittings**, and 1,077 drops into the loot feed
  teaching 115 item prices. Eating it again adds nothing.
- Fights recorded live before this ADR have no `key` field, but their key is computed on load from
  the same fields, so eating the log they came from doesn't duplicate them.
- Two genuinely distinct fights that share a log *and* both timestamps collapse into one. A fight
  is a contiguous span of combat, so this can't happen within a log; the trade is the same one
  ADR 0033 made.
- **Found while wiring this:** the watcher's combat stream never included `stance` or
  `invocation`. Both were parsed and emitted on their own channels, and nothing listened — so the
  tracker never learned which mode was in force and filed everything under "unknown", leaving
  [ADR 0020](./0020-split-by-stance-and-invocation.md) inert since it was written. Adding the two
  kinds to `COMBAT_KINDS` fixes it: the same real log now splits 207k of spell damage across six
  invocations (arcane mastery 93k, recovery 47k, empowering 28k…) and melee across four stances,
  where before every point of it was "unknown". Data recorded before the fix stays as it was.
