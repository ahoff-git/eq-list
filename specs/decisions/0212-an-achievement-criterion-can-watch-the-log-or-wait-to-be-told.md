# 0212: An achievement is one or more criteria, each either log-driven or self-reported

## Status

Accepted

## Context

The app ships several "did I do the thing" boards already — the shopping list's lifetime counts,
farming goals ([ADR 0198](./0198-a-goal-is-a-timeboxed-target.md)), and the scoreboard
([ADR 0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md)) — and none of them answers "have I
ever visited every zone" or "did I finish my epic quest", asks with no clock and no quantity that are
either **true forever once true** or **true because the player says so**, neither of which any existing
tracker models. A companion web app (a separate project, not this repo) ships a version of this idea
already: a shared library of achievements, checked off by hand, no verification at all — "if you say you
did it, it counts." That is the right default for anything the log cannot see. But this app already
*reads the log*, and a large share of what an achievement would ask ("visit every zone", "land a big
hit", "get your first kill") is exactly the kind of thing the alert engine and the scoreboard already
notice — so a checkbox that only a player can ever tick, in an app built around watching the game for
them, would be a missed reuse of two mature engines rather than a new capability.

The two engines in question, and what each already proves:

- **The alert engine** ([ADR 0084](./0084-a-watch-is-a-rule-not-a-substring.md) onward) matches a cast, a
  fade, or a whole raw log line against a `CastWatch` — trigger text plus conditions, with regex already
  guarded against hanging the watcher ([ADR 0203](./0203-a-regex-condition-refuses-its-own-danger.md)).
  `electron/watch-check.ts`'s `dryRun` already proves this matcher can run **standalone**, against a
  single throwaway watch, outside the live settings list — exactly the shape a criterion needs.
- **The scoreboard** ([ADR 0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md)) already tracks
  a personal best per category with a floor, and announces a `HighScore` the moment one falls. Once a
  category's current best clears a threshold it can never fall back below it (short of the player
  clearing their board), so "has this category ever reached N" is answerable by comparing the live board
  to a threshold, not by re-deriving history.

`"You have entered <zone>."` deserves special mention because it's the example that motivated this
decision. The raw sentence is exactly the shape a line watch already matches — but the log states a
**difficulty-decorated** name (`"The Steamfont Mountains 2 (Adaptive)"`), and this app already folds
that away for identity purposes (`zoneKey`, [ADR 0059](./0059-a-zone-s-variants-are-one-zone.md)) so a
kill record or a camp isn't split by which door was set. A raw-text watch matching "You have entered
The Steamfont Mountains" would count each difficulty variant as a separate zone for a "visit every
zone" achievement, which is a worse answer than the app already knows how to give — so zone criteria
get their own small, precise path onto the already-folded `zone` event instead of reusing the generic
line matcher for this one case.

## Decision

**An `AchievementDefinition` is a title, description and category, plus a list of `criteria`.** Each
criterion has one `kind`:

- **`"watch"`** — the exact shape a `CastWatch` matches with (trigger text, conditions, `match`,
  `onCast`/`onFade`/`onLine`), minus `id`/`enabled`. A criterion is checked by wrapping it in a
  synthetic single-watch `CastAlertSettings` and calling the real `matchCast`/`matchFade`/`matchLine`
  from `cast-alerts.ts` — the same trick `watch-check.ts`'s `dryRun` already uses to run one watch in
  isolation. No second matcher is written; an achievement criterion fires on precisely what an alert
  rule would.
- **`"zone"`** — a canonical zone name (`CURATED_ZONES`, `zones/gazetteer.ts`), matched by `zoneKey`
  against the live `zone` event, so a difficulty variant of a place doesn't count twice.
- **`"highscore"`** — a scoreboard category id plus a threshold, checked against `HighScore.value` as
  records fall, and reconciled against the live board whenever an achievement is loaded (a threshold
  set after the record already stands still unlocks, rather than only ever counting the next
  improvement).
- **`"manual"`** — no log evidence at all; the player ticks it themselves, which stays the *only*
  mechanism for anything the log genuinely cannot see, and remains available as an override on every
  other kind too — nothing here is a verification system, only an optional shortcut for the criteria
  that can check themselves.

**An achievement completes when every one of its criteria is done — plain "all", no partial-credit
mode.** Nothing in the first batch of achievements needs "3 of 5", and a criterion the player doesn't
want counted is simply left off rather than the model growing a threshold nobody asked for.

**Each criterion completion is bannered by name, immediately** ("The Feerrott — 12 of 187"), through the
same alert funnel a goal's milestone banner uses — `electron/achievement-tracker.ts` calls `raise()`
itself, since (as with a goal) the tracker decided this was worth hearing and there is nothing to queue.
**Full completion gets its own banner** — the "little party" — wearing the same shared style but a
distinct wording and icon (🏅 per criterion, 🎉 on completion), the same distinction `goalBanner`
already draws between a milestone and "done!". One shipped look (`built-in:achievement`), no per-item
style, following the Goal/Loot precedent (ADR 0198, [0105](./0105-a-tracked-item-says-so-when-it-drops.md)):
an achievement update reads as "something you did", not a per-instance emergency worth customizing.

**Definitions and progress are stored separately.** A handful of **stock** achievements ship in code
(`src/shared/achievement-library.ts`) — including one generated achievement, "Grand Tour", with one
`"zone"` criterion per entry in `CURATED_ZONES` — and are never written into the save file; a **custom**
achievement the player types in is data, held in `achievements.json` beside the (always-persisted)
progress record for every achievement, stock or custom. This mirrors `Goal`/`GoalTemplate` in spirit but
splits the other way round, because unlike a farming goal (many disposable instances of one shape) an
achievement is a fixed, named, permanent thing — closer to a `ScoreCategory` that also happens to need
per-user state.

**A criterion's log evidence is limited to what the alert engine and the scoreboard already expose.**
No new parser, no new event kind. This is deliberate: the value of "the same code that fires alerts and
high scores" is that a criterion inherits every hardening already paid for (regex safety, staleness,
zone folding) for free, and the day the app can watch for more (a landing sentence, a faction change),
achievement criteria widen automatically rather than needing their own follow-up.

**No cloud sync, no accounts, no sharing.** This app has neither today, and building either for this
feature would be new territory unrelated to what a log-reading desktop tool is for — see
`specs/neighbours.md`'s note on the companion web app being a *different* project with its own account
system. If a bridge between the two is ever wanted, it is a separate decision with its own ADR; this one
commits to nothing about it.

Rejected alternatives:

- **Folding achievements into `goal-tracker.ts`** as a goal with no clock. Rejected for the reason
  ADR 0198 already gives from the other direction: a goal's whole shape is a timebox and a quantity,
  neither of which an achievement has, and a permanent record bolted onto a farming-session tracker
  would need its own escape hatch from every rule about expiry.
- **A bespoke matcher for achievement criteria**, reading the same trigger/condition shape without
  calling into `cast-alerts.ts`. Rejected because it is the exact duplication this decision exists to
  avoid — two matchers reading one rule shape are two matchers that can disagree, and only one of them
  would ever get ADR 0203's regex guard by construction.
- **Raw-text zone matching** ("You have entered <name>") instead of a dedicated `"zone"` kind. Rejected
  above: it would silently split a "visit every zone" achievement by difficulty variant, which is a
  worse answer than the app already has on hand.
- **Bridging to the companion web app's shared achievement library now.** Out of scope: it would add
  networking and an account-linking step to an app that has neither, for a payoff (cross-app sharing)
  nobody has asked to trade that cost for yet.

## Consequences

- A fourth "what's running" board (after Timers, Buffs, Goals) on the tab strip — one more tab
  `TabBar`'s » menu may fold at the app's default width.
- `AlertUsage` gains `achievementsRunning`, and `ALERT_SOURCES` gains an `"achievement"` entry, so the
  Alerts tab's style-usage question ("what wears this look") stays answerable for every source that can
  raise a banner, achievements included.
- A criterion's `"watch"` shape is coupled to `CastWatch`'s: a future field added to alert rules (a new
  `WatchField`, say) is available to an achievement criterion for free, but a breaking change to that
  shape is also one achievement criteria must absorb.
- "Grand Tour" is the one achievement whose criteria are **generated**, not authored — the create-a-custom-achievement
  UI stays deliberately simple (a title, a description, a category, and criteria that are each a label
  plus an optional raw-text-or-regex trigger), and does not expose the `"zone"` or `"highscore"` kinds to
  a player typing one in. Those two stay tools this codebase uses to build stock content, not part of
  the player-facing authoring surface — nothing stops a later change from exposing them if that turns
  out to be worth the added UI.

## See also

[0198](./0198-a-goal-is-a-timeboxed-target.md) ·
[0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md) ·
[0084](./0084-a-watch-is-a-rule-not-a-substring.md) ·
[0203](./0203-a-regex-condition-refuses-its-own-danger.md) ·
[0059](./0059-a-zone-s-variants-are-one-zone.md) ·
[0105](./0105-a-tracked-item-says-so-when-it-drops.md) ·
[neighbours.md](../neighbours.md)
