# 0017: Camp-efficiency analytics, and asking the player for what the log can't say

## Status
Accepted

## Context
The damage meter ([ADR 0014](./0014-damage-meter-from-the-log.md)) and spell breakdown
([ADR 0016](./0016-combat-history-and-spell-analytics.md)) answer "how hard do I hit".
The question a loot-list app is really for is **"should I still be here"** — which needs
experience rate, how long a mob takes to kill, how much of the evening was spent sitting,
and how tonight's camp compares with last week's.

All of that is derivable from lines already being parsed, with one exception. EQ logs
experience as *gains only* ("You gain experience! (1.025%)") and never as a total, so
"time to level" has no starting point. That's not a parsing gap to work around — it's
information the app genuinely does not have.

Reading a real log also settled several details that guesswork would have got wrong:

- Level-ups are **one line**, not two: `You have gained a level! Welcome to level 2!`.
  Anchored patterns for each half separately matched neither, so nothing was detected.
- EQ capitalizes a creature's name at the start of a sentence and not mid-sentence, so
  `Obsolete model has been slain` and `You have slain obsolete model` are one mob under
  two keys — it showed up as duplicate rows in both the meter and the mob table.
- `Kainos`s warder has been slain by a skeleton!` parses as a kill, but a **pet dying** is
  not something you killed; left alone, your own pet tops the "worth killing" table.
- Dividing session experience by *elapsed* time makes every rate meaningless once
  downtime is included, exactly as it did for DPS in ADR 0014.

## Decision
**The combat tracker owns fight-scoped kills, experience and zone**, because it's what
knows where a fight starts and stops. Time-to-kill is measured between kills *within* a
fight (fight start → first kill → next kill …), experience is credited to the mob that
died in the 15s before the gain, and each finished fight is filed with the zone the log
last reported. Per-zone totals are then derived from stored fights, so "which camp pays"
needs no separate bookkeeping.

**Rates that divide by time use combat time, not elapsed time** — and where the
distinction matters to the reader, the UI says so: the mob and zone tables are labelled
"XP/min **fighting**", because excluding downtime is what makes mobs comparable while
also making the number a ranking rather than a forecast. Session XP/hour deliberately
uses *elapsed* time, since that one is a forecast. Downtime is surfaced as its own figure
(elapsed − combat), because it's the biggest lever on a night's real rate.

**Name canonicalization lives in the tracker, not the parser.** Folding the two
capitalizations of a name requires remembering the first spelling seen; a stateless
per-line parser can't, and guessing from capitalization alone would wreck real proper
nouns ("Minotaur Lord", players' names).

**What the log can't say, the app asks for.** `xp-progress.ts` holds "percent into the
current level": the player states it once, every subsequent gain is added, and
`You have gained a level!` resets it to zero — so it self-corrects and is asked for at
most once per level. It's persisted in its own small file rather than in settings, for the
same reason window bounds are (see `window-state.ts`): it changes on every kill, and
routing it through the reactive settings store would spam every window and rebuild the
tray each time.

That pattern is generalized in the UI as **`AskValue`**: where a calculation is missing an
input, the gap itself becomes the control — hover to learn why it's needed, click to fill
it in. A permanent "—" teaches the user nothing; this makes the missing piece obvious and
fixable at the point of use. It won't be the last such gap, so it's a component rather
than a one-off.

Rejected alternatives:
- **Folding `session-stats.ts` into the combat tracker.** Both now consume kill/XP
  events, which is real (if small) duplication — but the Session tab's counters are a
  pinned black box with their own tests, and merging them is a refactor, not a feature.
  Left as an open question rather than done quietly.
- **Guessing the XP baseline** (e.g. assuming a fresh level, or inferring from gains per
  kill) — a confidently wrong "time to level" is worse than an honest blank.
- **Putting XP progress in settings** — see above: change frequency, not squeamishness.
- **OCR'ing the experience bar** instead of asking. Deferred deliberately; the app already
  ships OCR for item lookup, so it's plausible, and it's on the todo to discuss.

## Consequences
- The Session tab becomes the camp screen: XP/hour, time-to-level, downtime, level, plus
  per-mob and per-zone tables. The Damage tab keeps damage, and gains a per-second
  sparkline, a death recap, pet share, personal bests, and a clipboard summary.
- A level-up *is* a known baseline (0% into the new level), so a character who levels while
  the app is watching is never asked at all — verified on a real log, which levelled three
  times and ended with a known 2.2% into level 4 without any input. The question only
  arises for a character who hasn't levelled since the app started tracking.
- Zone attribution is only as good as the log's last zone line. A fight before any zone
  line is filed without one and is left out of the zone report rather than guessed at.
- Time-to-kill assumes kills in a fight are sequential. Two mobs dying together split the
  interval between them, which flatters the second one.
- Deaths are recapped from a rolling 15s buffer of incoming damage. It answers "what was
  hitting me", not "how close was that" — the log has no health numbers, so it can't.
- `xpPerMin` excluding downtime is a **ranking** metric. The label says "fighting" for
  exactly this reason; read the session XP/hour figure for a forecast.
