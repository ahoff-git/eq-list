# 0281: Three seconds and point five were already right

## Status

Accepted

## Context

[ADR 0224](./0224-a-kill-can-log-after-the-faction-line-it-caused.md) fixed the kill signal's
*direction* and left two things explicitly unmeasured: whether `CORRELATION_WINDOW_SEC` (3 seconds) is
the right *width* now that the check is symmetric, and whether `DIALOGUE_MATCH_MIN_SCORE` (0.5,
`src/shared/faction-cause.ts`) is a sound threshold for `fuzzyScore` — a function tuned against short
item-name queries, never validated against sentence-length NPC dialogue. `specs/todo.md` also asked a
third question: how much of the hits neither signal explains are turn-ins the dialogue signal *should*
be catching.

The live stores this player's `%APPDATA%/eq-list` holds today (`faction-log.json`, `kill-log.json`) are
84 and 95 bytes — stub provenance stamps, not data, because both ledgers moved onto SQLite in
[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md) ahead of this survey. The real data
is `eqlist.db`: **20,571 faction hits** (11,292 raised/lowered, the rest floor/ceiling — excluded here,
same as ADR 0224) and **8,846 kill records**, spanning 2026-07-21 to 2026-10-06 — a wider, longer survey
than ADR 0224's original 52 MB/1,079-hit one. The game's own `eqlog_Kainos_qeynos.txt` (63.5 MB) was
also available and used for the dialogue half of this measurement, since no line of NPC dialogue is
stored anywhere outside the raw log. All three — the database, the log, and the wiki page cache that
feeds quest-giver/dialogue lookups — were copied to a scratch directory first; nothing here ever opened
the live files.

**Method.** A one-off script (not committed — kept in session scratch, per this project's "diagnose
against live userdata" discipline) replayed the exact same hold-then-resolve buffering
`main.ts`/`log-import.ts` use (ADR 0224: a faction event isn't resolved until `CORRELATION_WINDOW_SEC`
has elapsed past it), using the project's own **compiled** `fuzzy.ts`, `faction-cause.ts`
(`questsForSpeaker`, the two real constants) and `wiki/index.ts` (`createWikiClient` against the copied
cache, `cachedItems()` to run the real catalogue walk) — not a reimplementation that could drift from
what the app actually does. The replay's own resolution was checked against what's actually stored:
**11,094 of 11,292 hits (98.2%) agree** with `caused_by_kind` already on disk. Every one of the 198
disagreements runs **one direction** (never "stored says kill, replay finds nothing" — the candidate
kill pool was never missing anything the live app had). 13 are `null → kill`, plausibly a handful of
real-time edge cases (a kill noted a hair outside the live buffer, or before `scope.fought()` had
widened for a sitting) too rare to chase further. The other 185 are `null → dialogue`, and that pattern
has its own explanation below — it is the most useful single finding in this survey.

### 1. The kill window's width

Recomputing the gap to the *nearest* own-side kill for **every** raised/lowered hit — not just the ones
already resolved, and with no 3-second cutoff applied — gives the real distribution for the first time:

```
  0-0.5s    : 10092        3-4s      : 0           30-60s   : 3
  0.5-1s    : 427          4-5s      : 2           60-120s  : 6
  1-1.5s    : 0            5-7s      : 0           >120s    : 393
  1.5-2s    : 114          7-10s     : 5
  2-2.5s    : 0            10-15s    : 3
  2.5-3s    : 242          15-20s    : 0
                           20-30s    : 5
```

This is a sharp, two-population split, not a smooth curve: **96.3%** of hits (10,875/11,292) already
land within 3 seconds, and the distribution is essentially *empty* from 3s to 10s — widening to 5s
gains 2 hits, to 10s gains 7, to 20s gains 10, out of 11,292. There is no meaningful population of
real kill-caused hits the current window is clipping. The 393 hits with no kill within even two minutes
are a different population entirely (see §3), not a width problem.

Widening the window also has a real cost this player's own kill cadence shows directly: during actual
play, kills land **within 3s of the previous kill 8.1% of the time, within 5s 22.5%, within 10s 39.8%**
(median inter-kill gap 15s). A wider window would start attributing hits to the wrong kill at exactly
the busy, fast-cadence camps this app's own Race Unlocks feature steers players toward — trading a
~0.1-percentage-point coverage gain for a real, measurable misattribution risk. **3 seconds stays.**

### 2. The dialogue match threshold

`DIALOGUE_MATCH_MIN_SCORE` only ever does anything when a speaker is credited with **more than one**
quest — `narrowByDialogue` short-circuits and skips scoring entirely for a single-candidate giver
(correctly: there's nothing to disambiguate). Of the 224 kill-unexplained hits with a dialogue line
within `DIALOGUE_WINDOW_SEC`, 185 had a candidate quest to score against: **89 single-candidate** (the
threshold plays no role) and **96 multi-candidate**, covering only **9 distinct real (NPC, line)
situations** — a thin sample, but a clean one:

| score | result | NPC / line |
| --- | --- | --- |
| 0.291 | correctly rejected | *The Kerran Sha\`rr*, "I have no need for this, Kainos. You can have it back." |
| 0.316 | correctly rejected | *Canloe Nusback*, "Aha! You have downed a Crushbone legionnaire! ..." |
| 0.675–1.000 (7 situations) | correctly matched | *Crusader Iktra*, *The Kerran Sha\`rr*, *Canloe Nusback*, *Larkon Theardor* |

Nothing scored between 0.32 and 0.67 — 0.5 sits in the middle of an empty gap, not near either edge of
a close call. Tellingly, the same sentence — *"I have no need for this, Kainos. You can have it
back."* — scores 0.291 against the wrong giver's cached quest dialogue and 0.715 as a correct match for
*Crusader Iktra*, which is exactly the discrimination this threshold exists to make, working as
intended. The single-candidate cases (where the score is computed but never gates anything) show the
same bimodal shape independently: 36 hits scored under 0.3, 53 scored at or above 0.9, **none in
between** — further evidence that a real matching line and a real non-matching line for this corpus
don't produce ambiguous scores. **0.5 stays**, on real evidence it sits in a safe gap — though the
sample (9 distinct situations) is thin, and worth another look once more data accumulates.

### 3. Where the remaining hits actually go

Of the 417 hits (3.7%) no kill explains within 3s:

- **185 (44%)** have both a dialogue line nearby *and* a cached quest giver/dialogue to match it
  against — these are turn-ins today's wiki cache (956 quest pages, grown since each hit was first
  recorded) **can** explain.
- **39 (9%)** have a dialogue line nearby but name a giver this cache has never fetched at all (ADR
  0221/0223's already-documented "coverage depends on what's cached" limit, now with a real count).
- **193 (46%)** have nothing nearby at all — no kill, no dialogue, within either window. This is the
  real floor of what proximity-based guessing can ever explain for this log, not a tuning problem.

The 185 figure is the real surprise: it means that **not one of this player's 20,571 real faction hits
has ever been recorded with `caused_by_kind = 'dialogue'`** — not because the window or the threshold
are miscalibrated, but because of how `recheckDialogueCauses` (`electron/faction-log.ts`, introduced by
[ADR 0259](./0259-a-stored-quest-guess-can-be-rechecked-in-place.md)/[ADR 0261](./0261-an-unmatched-speaker-is-no-cause-at-all.md))
is scoped: its query is `WHERE caused_by_kind = 'dialogue'` — it only ever **revisits a hit that
already carries a dialogue guess**, to correct or withdraw it as the cache changes. It has no way to
*promote* a `null` hit, because the npc/text seen at the time is never persisted when nothing matched
at all — `guess()` (`src/shared/faction-cause.ts`) simply returns `undefined`, and the `FactionRecord`
that gets written carries no trace that a conversation happened nearby. A hit that resolves to no cause
the first time stays uncaused forever, even after the exact quest-giver page it needed gets cached a
week later and `wiki.catalogueJson()`'s background warm-up (`main.ts`, after every launch) would now
answer differently.

## Decision

- **No change to `CORRELATION_WINDOW_SEC` (3) or `DIALOGUE_MATCH_MIN_SCORE` (0.5).** Both measured out
  as already well-placed against real data — the first sits at a natural cliff in the gap distribution
  with a real misattribution cost on the other side of widening it; the second sits in the middle of an
  empty gap between real matches and real non-matches. Neither constant in `src/shared/faction-cause.ts`
  changes.
- **The coverage gap `recheckDialogueCauses` can't close is recorded here, not fixed.** Closing it needs
  a hit that resolved to no cause at all to remember the npc/text it saw (so there's something to
  recheck later) and `recheckDialogueCauses`'s query to consider `caused_by_kind IS NULL` rows too — a
  real schema change and a new question about scope (every null hit, forever? bounded how?), not a
  tuning fix, so it isn't attempted in this ADR. Left as the next open item in `specs/todo.md`, with the
  real numbers this survey found attached to it instead of the open-ended "re-run the cross-reference"
  framing it carried before.

## Consequences

- The Faction tab's Hits list keeps today's behaviour exactly — no visible change for any user.
- The next person who looks at `CORRELATION_WINDOW_SEC`/`DIALOGUE_MATCH_MIN_SCORE` doesn't need to
  re-run this survey from scratch to know both are sound; they need a reason to think the *shape* of
  this player's data (kill cadence, dialogue corpus) doesn't generalize before spending time on it again.
- The real, quantified floor on "hits nothing can explain" is **193 of 11,292 (1.7%)** raised/lowered
  hits — not the larger number a reader would get by just counting everything `caused_by_kind IS NULL`
  today, which conflates that real floor with the 185 (1.6%) this app's own cache has already grown
  enough to explain and simply never got asked again.
- `recheckDialogueCauses`'s one-directional scope is now a known, measured gap rather than an assumed
  non-issue — ADR 0259/0261 built it to correct a *wrong* guess, and it does that well, but it was never
  asked to produce a *new* one, and this survey is the first real evidence of how much that costs
  (potentially all 185 of this player's genuine dialogue-caused hits, going back to the first one).
