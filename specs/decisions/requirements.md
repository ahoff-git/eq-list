# Requirements

**The rules in force, stated once.** Every ADR in this folder argues a decision and records the
evidence for it; a rule that survived those arguments is written here, in one line, with the records
it came from. This is the consolidation: 130-odd decisions restate each other constantly — the same
principle arrives from a new direction and gets argued again — and reading them end to end is no
longer a way to find out what the app is supposed to do.

So: **this file says what holds. The ADRs say why.** Where the two disagree, the ADRs win and this
file is wrong and should be fixed.

Superseded records are not cited. A rule that a later decision reversed is not a rule.

- [README](./README.md) — the ADR log and the open questions.
- Area specs branch off [specs/README.md](../README.md).

## Contents

[Recording a decision](#recording-a-decision) ·
[Honesty about what we know](#honesty-about-what-we-know) ·
[Reading the log](#reading-the-log) ·
[Health and experience](#health-and-experience) ·
[The damage meter and combat history](#the-damage-meter-and-combat-history) ·
[Kills, drops and mob knowledge](#kills-drops-and-mob-knowledge) ·
[Naming a zone](#naming-a-zone) ·
[Maps](#maps) ·
[Travel](#travel) ·
[Reference sources](#reference-sources) ·
[Alerts](#alerts) ·
[Spawn timers](#spawn-timers) ·
[Buffs](#buffs) ·
[Windows and the interface](#windows-and-the-interface) ·
[Peers](#peers) ·
[Stored data](#stored-data) ·
[Build and diagnostics](#build-and-diagnostics)

## Recording a decision

- A significant technical decision is an ADR in this folder, Nygard format, sections
  `Status` · `Context` · `Decision` · `Consequences` and nothing else, filed
  `NNNN-kebab-case-title.md` with an `# NNNN: Title` heading. ([0001](./0001-record-architecture-decisions.md))
- Numbers are sequential and never reused. An `Accepted` decision is superseded, not edited — and the
  supersession is stated in the superseded record's own `Status`, not only in the log. ([0001](./0001-record-architecture-decisions.md))
- **A number is claimed when the file is created**, not when the work is finished — the file on disk
  is the lock. A collided number is resolved by moving the *later* record to the end of the
  sequence. ([0133](./0133-the-log-is-an-index-and-the-rules-are-consolidated.md))
- **The log is an index, this file is the specification, a record is the argument** — and no rule is
  stated in more than one of them. A log entry is one line, carrying a note only where the record's
  standing has changed. ([0133](./0133-the-log-is-an-index-and-the-rules-are-consolidated.md))
- **Records are not merged to remove repetition.** The sixth independent arrival at a principle is
  the argument for it being one; consolidation happens here, by citation. ([0001](./0001-record-architecture-decisions.md), [0133](./0133-the-log-is-an-index-and-the-rules-are-consolidated.md))
- Every new ADR adds a one-line entry to the [log](./README.md), and the rule it establishes here.

## Honesty about what we know

Almost nothing this app knows is a fact it was told. These are the rules that keep an inference from
reading like a measurement, and they are shared code
([`estimates.ts`](../../src/shared/estimates.ts)), not a habit.

- **A bound only moves one way.** Evidence tightens a constraint (`tighten`) and widens a containment
  (`widen`); nothing loosens the first or narrows the second. ([0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md), [0121](./0121-a-mob-is-a-range-of-levels.md))
- **An implausible observation is discarded, never clamped.** Against a figure that only moves one
  way, a clamped value is a wrong answer that can never be taken back. ([0031](./0031-an-inferred-bound-must-be-able-to-fall.md), [0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md))
- **A bound that only falls must have a way down** — a hand-typed value, and a way to forget what was
  measured. ([0031](./0031-an-inferred-bound-must-be-able-to-fall.md), [0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md), [0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md))
- **What the player said outranks what we worked out, and never destroys it.** An override sits beside
  the inference; clearing it restores the inference rather than leaving a blank. ([0056](./0056-a-dropped-record-keeps-what-it-taught.md), [0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md))
- **What the log states outranks what we correlated.** A stated caster beats a remembered one, always. ([0095](./0095-your-own-dot-tick-is-yours.md))
- **Observation outranks a reference, and the disagreement is the product.** Confirmed / undocumented /
  unseen are all worth showing; which figure leads depends on the sample, and the badge says which
  you are reading. ([0025](./0025-observation-over-the-wiki.md), [0101](./0101-an-item-page-says-who-dropped-it.md))
- **Sample size is part of the figure.** "1 for 1" and "40 of 120" are different claims and must not
  render alike. ([0024](./0024-mob-knowledge.md), [0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md))
- **Sources that disagree are reported, not resolved.** Crossing bounds mean one side is *wrong*; a
  wide spread means the figure is *soft*. Which side is wrong is usually a fact about an evening the
  app did not attend. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md), [0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md), [0121](./0121-a-mob-is-a-range-of-levels.md))
- **A spread is not averaged into a figure.** Where gaps disagree the range leads; where the wiki
  wrote two bands and a gap, both bands are shown. ([0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md), [0122](./0122-a-zone-wears-its-levels.md))
- **A caveat names causes, not a confidence score.** A cause is actionable; a percentage is not. ([0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md))
- **We refuse to invent a number nothing could support.** No lower bound on a respawn, no per-peer
  trust score, no era guessed from an item id. A guess wearing a measurement's clothes is the failure
  mode. ([0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md), [0124](./0124-lucy-is-a-second-opinion.md), [0132](./0132-a-contribution-is-keyed-by-who-made-it.md))
- **Failing open beats failing closed where the costs are unequal**, and the direction is chosen
  deliberately: an unknown zone is available, an unreadable version reports nothing, a missing
  identity is nobody. ([0064](./0064-every-build-has-a-number.md), [0065](./0065-a-zone-belongs-to-an-expansion.md), [0132](./0132-a-contribution-is-keyed-by-who-made-it.md))
- **What we could not place is held apart and said, and every figure derived from it inherits the
  doubt** until the log settles it. ([0127](./0127-an-unknown-name-is-held-not-dropped.md), [0130](./0130-data-in-doubt-says-so.md))
- **What the log can't say, the app asks for** — and the gap itself is the control (`AskValue`), never
  a permanent "—". ([0017](./0017-camp-efficiency-and-asking-the-player.md))
- **Every state a player can set, they can unset**, with the opposite control within reach. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md))

## Reading the log

- **A pure parser, a dumb watcher.** One line in, one event or `null` out, no I/O, fully tested; the
  watcher polls, reads only appended bytes, and is truncation-safe. Matching against the shopping
  list lives in the store. ([0004](./0004-log-watching-strategy.md))
- **One split, one dispatch, `logId` on every event.** `splitLine` is the only place a raw line is
  taken apart, every parser takes a `LogLine`, and the dispatcher returns the one event a line
  produces. A line with no timestamp is a wrapped continuation and is dropped. ([0019](./0019-parse-once-and-one-tracker.md))
- **Every event carries `logId` and `raw`**, so anything downstream can point at its source line
  without re-reading the file. ([0019](./0019-parse-once-and-one-tracker.md))
- **All timing comes from the log's own timestamps, never the wall clock**, so a replayed evening
  meters identically to a watched one and the tests need no fakes. Where a decision genuinely needs
  "now", the clock is passed in. ([0014](./0014-damage-meter-from-the-log.md), [0126](./0126-a-fight-is-filed-when-it-ends.md))
- **The read position outlives the app**, and the gap is replayed through the ordinary live path — no
  second pipeline. The advance is exactly-once: written through only after a batch has been emitted. ([0044](./0044-the-log-position-outlives-the-app.md))
- **A log we have never read is pinned at its end.** There we genuinely cannot tell news from history,
  and on a first run there is no state to preserve. ([0030](./0030-history-is-not-news.md), [0044](./0044-the-log-position-outlives-the-app.md))
- **Where you are is state, not news: recover it, replay nothing else.** Catch-up returns at most a
  zone and a position, with their own timestamps; a zone line clears any position read before it. ([0043](./0043-state-is-not-news-either.md))
- **An alert must be about something that just happened.** `LIVE_WITHIN_MS` guards every matcher, so
  a replayed gap raises nothing without the replay having to know alerts exist. An unreadable
  timestamp is let through — a missed alert is the worse failure. ([0030](./0030-history-is-not-news.md), [0044](./0044-the-log-position-outlives-the-app.md), [0105](./0105-a-tracked-item-says-so-when-it-drops.md))
- **A recorded event's identity is the log line behind it.** A kill is keyed `timestamp | mob | killer`,
  a drop `timestamp | item | source`, a fight `basename(logFile) | startedAt | endedAt`. The key is
  intrinsic to the line, so the same line always produces the same key. ([0033](./0033-eating-a-log-is-idempotent.md), [0055](./0055-eating-a-log-fills-history.md))
- **A count is dropped on a second sighting; a derived summary is re-derived.** Reading a file twice
  must not move a kill count or a drop rate — and must refresh a fight, because a fight is a summary
  of lines still sitting in the file. Idempotent means *converges*, not *ignores*. ([0033](./0033-eating-a-log-is-idempotent.md), [0128](./0128-a-fight-is-re-derived-not-refused.md))
- **A play session is a login**, keyed on the login line's own timestamp so a re-read is the same
  sitting rather than a second one. ([0054](./0054-a-sitting-is-a-login.md))
- **Eating a log fills every bucket it can**, through an importer with a tracker of its own — never
  the live one. It does not touch the live meter, experience, health, or the shopping list, and it
  broadcasts `dataChanged` when it is done. ([0055](./0055-eating-a-log-fills-history.md))
- **An index is maintained, not re-derived**, and a change announces itself, coalesced — fired on
  "was this new?" so a re-read stays silent. ([0051](./0051-an-index-is-maintained-and-a-change-announces-itself.md))
- **What we couldn't read is counted by its shape, and nothing anyone said is kept.** Other people's
  words are matched and discarded; the rest folds digits to `#` and is capped, and says what it turned
  away. ([0079](./0079-an-unread-line-is-counted-by-its-shape.md))
- **"What has the log said lately" is answered from the file, not from a session buffer** — one seek,
  a bounded read, widening on request, and the panel says which answer it gave. ([0089](./0089-a-rule-is-checked-against-the-log-file.md))
- **Name canonicalization lives in the tracker, not the parser** — first spelling wins, in one shared
  registry. A stateless per-line parser cannot remember the first spelling seen. ([0017](./0017-camp-efficiency-and-asking-the-player.md), [0027](./0027-only-your-kills-count.md))

## The damage meter and combat history

- **The parser is a pure black box tested on verbatim real log lines**, with attack verbs enumerated
  rather than matched loosely. ([0014](./0014-damage-meter-from-the-log.md), [0029](./0029-measurements-corrected-against-the-log.md))
- **One tracker owns the session.** Two modules counting the same events is a bug waiting to happen. ([0019](./0019-parse-once-and-one-tracker.md))
- **A fight ends on a death, not on silence.** A *resolved* fight closes after `SETTLED_END_MS`; an
  unresolved one takes `ENGAGED_END_MS` of total quiet. Active time keeps the tight gap rule, so
  tolerating a lull never inflates the denominator. ([0036](./0036-a-fight-ends-on-death-not-a-lull.md))
- **A fight is filed the moment the log's rule says it is over**, whether or not anything has been
  logged since — and the panel keeps showing it. Over and gone are two things. ([0126](./0126-a-fight-is-filed-when-it-ends.md))
- **Every banked fight records why it ended** — `kill` · `death` · `timeout` · `cut` — and absent
  means only "stored before this was recorded". ([0078](./0078-a-fight-records-why-it-ended.md))
- **Damage is stored as cells and rolled up.** One cell per (victim, attacker, kind, source), read
  from either end, so a new question is an axis order rather than a new component and no two views can
  disagree about a total. Misses are cells with damage 0. ([0053](./0053-damage-is-cells-rolled-up.md))
- **A cell partitions; a qualifier doesn't.** Nothing that overlaps its siblings is allowed to be a
  level — "Critical", "Riposte" and "Flurry" are a footnote, not a row. ([0053](./0053-damage-is-cells-rolled-up.md))
- **Every share is a share of something stated**, and is absent rather than approximated where the
  node spans several victims or attackers. ([0053](./0053-damage-is-cells-rolled-up.md))
- **Sides come from the swings, never from the shape of a name.** `Bonefire` and `Marrowbane` are mobs
  we killed. "An ally hit it" is near-certain and wins; "an enemy hit it" only leans. ([0053](./0053-damage-is-cells-rolled-up.md), [0054](./0054-a-sitting-is-a-login.md), [0067](./0067-the-meter-counts-your-party-s-fights.md))
- **The unit of filtering is the fight, not the combatant.** A fight nobody of yours is in never
  starts; a fight one of yours is in is metered whole. Always on, no setting — a meter with a truth
  switch is two meters. It degrades rather than failing when the roster is unknown. ([0067](./0067-the-meter-counts-your-party-s-fights.md))
- **Party membership is evidence, never authority.** `has` returning false means "not known to be". ([0067](./0067-the-meter-counts-your-party-s-fights.md))
- **A pet is proven, not guessed** — learned from its own attack confirmation, never from a name's
  shape. It survives a meter reset and is cleared on a character change. ([0077](./0077-a-pet-is-proven-not-guessed.md))
- **A name we cannot yet place is held loosely, not dropped**, and is processed as whatever it turns
  out to be. "Unproven" is a statement about what we know, not about the data. ([0127](./0127-an-unknown-name-is-held-not-dropped.md))
- **A DoT tick belongs to whoever cast it** — resolved once, at the top of `record`, before any
  consumer reads the attacker, and never re-guessed where the log named a caster. ([0071](./0071-a-dot-tick-belongs-to-whoever-cast-it.md), [0095](./0095-your-own-dot-tick-is-yours.md))
- **Every tally splits by stance and invocation**, filed under whichever mode was active, presented
  combined, split on hover. Modes are taken from the log rather than enumerated, and file under
  "unknown" before one is named. ([0020](./0020-split-by-stance-and-invocation.md))
- **Cast timing is measured, not looked up.** One cast in flight per caster; an outcome resolves the
  pending cast; a DoT tick never consumes one; `dpc` is per-landing damage over the *average* cast
  time. Only your own casts are tracked. ([0016](./0016-combat-history-and-spell-analytics.md))
- **Mana comes from the game's own `spells_us.txt`**, columns ≤ 51 only, scalars only, priced at the
  rank actually cast, injected into the tracker so it stays free of I/O. Unknown and free stay
  distinct; the wiki is the fallback, not a rival. ([0080](./0080-the-game-s-own-spell-file.md))
- **Rates that divide by time use combat time, and the label says so** where the distinction matters.
  Session XP/hour uses elapsed time, because that one is a forecast. Downtime is its own figure. ([0017](./0017-camp-efficiency-and-asking-the-player.md))
- **History is a flat, bounded list of finished fights; sessions are derived.** One list, one bound,
  nothing to keep consistent. The cap drops the oldest by the log's clock, not by filing order. ([0016](./0016-combat-history-and-spell-analytics.md), [0055](./0055-eating-a-log-fills-history.md))
- **A fight is named after what your side damaged most**, falling back to what died, then to what took
  the most damage — and the label is recomputed on read. ([0054](./0054-a-sitting-is-a-login.md))
- **A stored fight keeps the handle back to its source**: the log file plus the log's own timestamps.
  `logIds` points at a line within one run and no further. ([0021](./0021-stored-fights-keep-their-source.md), [0128](./0128-a-fight-is-re-derived-not-refused.md))
- **A stored fight whose source is gone is kept and says so**, never dropped. ([0128](./0128-a-fight-is-re-derived-not-refused.md))
- **Combat history stays lossy on purpose.** A fight teaches nothing beyond itself, so the cap keeps
  dropping the oldest — the one explicit exception to the rule below. ([0056](./0056-a-dropped-record-keeps-what-it-taught.md))
- **A high score is a personal best per character, with a floor.** The first score sets the bar
  silently, old news is filed rather than announced, a running counter announces the crossing once,
  and the board seeds from the fights already on disk. ([0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md))
- **A figure added after the fact is forward-only** unless it is re-derived. Fights already on disk
  keep what they were written with. ([0095](./0095-your-own-dot-tick-is-yours.md))
- **Snapshots are coalesced before broadcast.** A poll can deliver thousands of combat lines at once
  and no UI can use thousands of snapshots. ([0014](./0014-damage-meter-from-the-log.md))

## Health and experience

- **Maximum hit points are bounded, not measured.** A **floor** is damage absorbed in one stretch with
  no healing — you demonstrably lived through it. A **ceiling** is damage that killed you starting from
  *known full*, which the log states two ways: an overheal on you, or a respawn. ([0018](./0018-inferred-max-hit-points.md))
- **Every window is guarded, because ignoring a guard produces a confidently wrong number.** A heal or
  a lull ends a floor window; a buff fading or a level-up drops the observations and restarts
  collection; the killing blow is never counted as survived; heals between full and death are
  subtracted. ([0018](./0018-inferred-max-hit-points.md))
- **Where the two contradict, the assumption gives way, not the statement.** A measured ceiling below
  the floor discards the *floor* — a ceiling runs between two things the log says outright, while a
  floor only assumes nothing healed you. ([0031](./0031-an-inferred-bound-must-be-able-to-fall.md))
- **An unhealed stretch longer than `MAX_UNHEALED_SPAN_MS` is discarded rather than banked**, unless a
  stated regeneration rate can actually be subtracted. ([0031](./0031-an-inferred-bound-must-be-able-to-fall.md))
- **Current health is never simulated.** A running total drifts without bound; a bound on the maximum
  is a stable fact. ([0018](./0018-inferred-max-hit-points.md))
- **Experience progress is stated once and self-corrects.** Every gain is added and a level-up resets
  it to zero, so it is asked for at most once per level. ([0017](./0017-camp-efficiency-and-asking-the-player.md))

## Kills, drops and mob knowledge

- **A kill is recorded with its evidence, not just a position** — the fix and its age, the previous
  fix, distance/time/speed, a dead-reckoned guess in its own fields, and a confidence score. Nothing
  is discarded; a kill with no fix is still recorded. ([0022](./0022-invocation-effects-and-kill-locations.md))
- **Confidence is part of the marker, not a footnote.** One ladder, glyph *and* colour, and below
  "approximate" nothing is plotted — the record is kept, the false precision isn't. ([0023](./0023-kill-heatmap.md))
- **One filter object, one filter function, both views.** A filtered map and the list beside it are
  the same query because there is only one implementation. ([0023](./0023-kill-heatmap.md), [0058](./0058-a-ledger-needs-filters-and-a-column-to-sort-by.md))
- **A position fix belongs to the zone it was taken in**, matched verbatim — zoning is a teleport, so
  the last fix from the zone you left is wrong, not stale. Your position is cleared when you zone. ([0027](./0027-only-your-kills-count.md), [0059](./0059-a-zone-s-variants-are-one-zone.md), [0060](./0060-a-position-belongs-to-the-zone-it-was-taken-in.md))
- **Only your own kills count for a rate, and the log has to say whose they were.** A stranger's kill
  is still evidence the mob spawns here, is excluded from drop rates unless you looted it, and is
  believed half as much as a position. ([0027](./0027-only-your-kills-count.md))
- **Enrich once, at the boundary.** A loot line is attached to its corpse at ingestion, so "kills that
  dropped X" is a filter over data we already have. ([0023](./0023-kill-heatmap.md))
- **Your own knowledge is derived, never stored.** Observations roll up the kill log on demand, so
  there is one record and no second copy to drift. ([0024](./0024-mob-knowledge.md))
- **A dropped record keeps what it taught.** Eviction retires a record into an observation first, so a
  cap costs detail and never knowledge. Clearing asks a second question and keeps the summaries by
  default. ([0056](./0056-a-dropped-record-keeps-what-it-taught.md))
- **The shared unit is an observation, not a kill** — counts, which merge by addition, carrying none
  of the observer's movements. ([0024](./0024-mob-knowledge.md))
- **Sharing sends the conclusion, not the evidence.** A shared kill carries no time, no loot and
  nothing about the `/loc` behind it. ([0023](./0023-kill-heatmap.md), [0132](./0132-a-contribution-is-keyed-by-who-made-it.md))
- **Roam areas are weighted by samples**, so pooling widens the spread to cover both centres rather
  than shrinking it. ([0024](./0024-mob-knowledge.md))
- **Money is an integer count of copper, everywhere**, in two ledgers — coin off corpses and what
  auto-sold drops fetched — summed only where the sum is the question. Corpse coin is placed by what
  the log was doing; a price is derived from the loot ledger. ([0047](./0047-money-is-copper-in-two-ledgers.md))
- **A mob is a thing you hunt, not a thing that drops.** A list entry has a `kind`; a mob is excluded
  from loot matching and from "what's left", and is placed by your own kills because its wiki page has
  no sources. ([0098](./0098-a-mob-is-a-thing-you-hunt.md))
- **An item page says who dropped it and where-ish**, from the pooled tally read from the item's end,
  carrying the same three verdicts and the same thresholds the mob page uses. ([0101](./0101-an-item-page-says-who-dropped-it.md))
- **A position is printed `y, x`, rounded, y first**, through one formatter, with its spread beside it
  and one sentence saying what the area is. ([0104](./0104-a-position-is-read-and-arrives-with-its-evidence.md))
- **Search reads your own records too**, ranked by the same scorer at the same threshold, offered
  beneath the wiki's results under their own heading — and a title with no page still opens one. ([0103](./0103-search-can-answer-from-your-own-log.md))
- **The hunt answers two questions**, by zone and by item, from one built hunt inverted rather than
  two pipelines. Places sort by rate then zone; an unmeasured place sorts last, not as zero. ([0125](./0125-a-hunt-is-two-questions.md))
- **An add says what it did**, diffed from the list before and after, as one replaceable notice per
  thing. ([0106](./0106-an-add-says-what-it-did.md))

## Naming a zone

- **Store the log's own wording, verbatim. Group on read.** Space is cheap; a discarded fact isn't. ([0057](./0057-a-grade-is-not-an-identity.md), [0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md))
- **A grade and a difficulty are not identities.** Names fold where they are *matched* and stay whole
  where the log is *recorded*, so "Blackburrow 3" survives in the status bar while its kills tally
  with Blackburrow's. ([0057](./0057-a-grade-is-not-an-identity.md), [0059](./0059-a-zone-s-variants-are-one-zone.md))
- **Looseness belongs to a resolver, not to a fold.** A fold must be right about a name it has never
  seen; a resolver is handed the candidates, so it can be loose *and* fail closed — answering only
  when exactly one candidate wins. ([0068](./0068-a-zone-name-resolves-against-what-we-know.md))
- **How loose a call site goes is set by what a wrong answer costs there.** A mislabel is cheap; a
  wrong map file draws a different zone under the right name. ([0068](./0068-a-zone-name-resolves-against-what-we-know.md), [0122](./0122-a-zone-wears-its-levels.md))
- **A key comes from a table; only a filter may be fuzzy.** A key that says yes too often corrupts
  every rate derived from it, where a filter merely shows a row that doesn't belong. ([0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md))
- **A misspelling within one edit is the same zone**, measured against the whole shipped corpus rather
  than tuned, and used to ask, never to key. ([0075](./0075-a-zone-s-misspelling-is-the-same-zone.md))
- **A supplied gazetteer outranks our guesses, and what we verified outranks it.** A loser stays as a
  candidate and its spellings become aliases, so nothing is lost by the ordering. An alias may only
  ever add a match, never cost one. ([0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md))
- **A zone belongs to an expansion, and that is how we know it exists** — fetched, not typed, with
  "not in this game" and "era not open yet" kept apart, and failing open. ([0065](./0065-a-zone-belongs-to-an-expansion.md))
- **A zone no table knows keeps its own name**, folded only by rule. ([0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md))

## Maps

- **Only the game's own map files.** No bundled scans, no authored calibration: a projection is read
  off the geometry's own bounds, so a hand-tuned alignment is not expressible. ([0042](./0042-only-the-game-s-own-maps.md))
- **A map source is a folder the player picks**, discovered rather than hardcoded, and every source
  produces `Zone[]` so one code path serves them all. The choice persists. ([0039](./0039-render-the-game-s-own-maps.md))
- **All maps are selectable, and a loose name is worse than no name.** An unnamed zone shows as its
  file name; the naming order is catalogue → this pack's solved names → the file's own name. ([0039](./0039-render-the-game-s-own-maps.md), [0061](./0061-a-map-pack-names-its-own-zones.md))
- **Each pack is named from its own labels, and nothing else's.** Two surveys of one world describe
  two graphs and two gazetteers. ([0061](./0061-a-map-pack-names-its-own-zones.md))
- **A zone the chosen pack lacks is drawn from the game's own `maps/`** — the one folder every install
  has. Coverage, not blending: one zone is still one file, the borrowed zone is named by the folder it
  came from, the pack wins wherever both have something, and the title bar says so. ([0063](./0063-a-zone-the-pack-lacks-is-borrowed.md))
- **Two files that draw one zone are one zone, and the named file wins.** Coordinates are never
  merged — two drawings are two frames. ([0111](./0111-one-zone-one-map-file.md))
- **A folder is named once and the answer is kept**, keyed by a cheap signature of the folder. When a
  solve is needed it is bounded background I/O, shared between callers. ([0072](./0072-a-folder-of-maps-is-named-once-and-remembered.md))
- **Floors come from the mapmaker's labels, not from the geometry.** Anchored matching, height decides
  the order, and labels not separated in height are not storeys. Every floor at once is the default; a
  stair shows on both floors it touches. ([0040](./0040-floors-come-from-the-mapmaker.md), [0048](./0048-a-map-label-is-read-by-its-words.md))
- **A label is classified by what its words actually say**, on a tally of the corpus kept in the code,
  with `note` the only fallback. A bracket it can't read defers to the rest of the label. ([0048](./0048-a-map-label-is-read-by-its-words.md))
- **A marker is layer-scoped only when a person chose the layer.** Anything read out of the log is
  filed zone-wide and shows on every floor — the honest reading of "we don't know which". ([0037](./0037-one-zone-many-layers.md), [0040](./0040-floors-come-from-the-mapmaker.md))
- **The graph is audited on the map it was read from**, while navigating only, with what has nowhere
  to be on the map said in an aside rather than omitted. ([0113](./0113-the-graph-is-drawn-on-the-map-it-was-read-from.md))
- **The map marks the mobs your hunt wants, wherever anything can place them** — derived, never stored,
  and never a pin you can hold, drag, share or edit. Drawn loud, because it is what the map was opened
  for, with the uncertainty drawn around it. A spot you pinned by hand isn't marked twice, and nothing
  able to place a mob means no mark at all. ([0142](./0142-a-hunted-mob-marks-itself.md))
- **A position comes from your kills, peers' kills, or the wiki — ranked, never merged, and the mark
  says which.** Observation leads; a stated coordinate answers only where no kill can, has to be about
  the zone on screen, and carries neither a spread nor a sample count, so it can never read as the
  tightest figure on the map. ([0142](./0142-a-hunted-mob-marks-itself.md), [0025](./0025-observation-over-the-wiki.md))

## Travel

- **Nodes are boundaries; edges are the walks between them.** A border is one place in two zones,
  holding its position in each. Crossing is free and edgeless, and cost is EQ world units of
  straight-line walking throughout. ([0062](./0062-a-travel-graph-of-zone-lines.md))
- **Route between zones, never inside one.** An `L` record is a wall in a dungeon and a contour
  outdoors, so a drawn path would be a guess dressed as advice. ([0062](./0062-a-travel-graph-of-zone-lines.md))
- **A border with several crossings keeps them all, and a walk takes the nearest.** An average puts
  the border where none of them is. ([0062](./0062-a-travel-graph-of-zone-lines.md), [0113](./0113-the-graph-is-drawn-on-the-map-it-was-read-from.md))
- **A boat is a boundary; a conveyance is a conveyance only when taking it asks something of you** —
  a class, or a favour. That, and nothing else, is what a toggle is for. ([0062](./0062-a-travel-graph-of-zone-lines.md))
- **A teleport network collapses to a hub**, and only rings and spires are networks. A cast
  conveyance's edges are one-way out of the hub, entered free from wherever the route starts. ([0062](./0062-a-travel-graph-of-zone-lines.md), [0066](./0066-a-port-is-cast-from-where-you-stand.md), [0069](./0069-a-succor-is-a-port-inside-one-zone.md))
- **Membership is read off the labels, not typed from memory.** Hand-authored data corrects and
  completes; it is not the source. ([0062](./0062-a-travel-graph-of-zone-lines.md), [0119](./0119-a-pile-of-destinations-is-a-sign.md))
- **A subtraction is an input to creation; everything additive may be a later pass.** Forget an
  addition and the graph is thinner, which is honest; forget a subtraction and it lies. So regenerating
  is always safe. ([0062](./0062-a-travel-graph-of-zone-lines.md), [0065](./0065-a-zone-belongs-to-an-expansion.md), [0111](./0111-one-zone-one-map-file.md))
- **Generation is two files** — what the maps said, and that plus the hand-authored pass. Generating
  never touches the second, so a rebuild goes stale loudly rather than dropping authored travel. ([0062](./0062-a-travel-graph-of-zone-lines.md))
- **Precedence for a border: an exact map label, then the wiki, then a near-miss pairing.** Only a map
  label carries coordinates; the wiki adds reachability and never a position; the pairing pass
  contributes a coordinate and never a connection. ([0115](./0115-a-border-one-side-could-not-name.md), [0117](./0117-the-wiki-says-which-zones-touch.md))
- **A label that says its own conveyance is dead is not a travel point**, on four measured words that
  must sit adjacent to the conveyance. ([0114](./0114-a-conveyance-the-map-calls-dead-is-not-one.md))
- **A pile of five or more distinct destinations in one spot is a destination board, refused
  wholesale.** Measured over ~1,200 files; a label that can't be believed is refused. ([0119](./0119-a-pile-of-destinations-is-a-sign.md))
- **Within one zone you never walk through a node**, checked against the walks the search has rather
  than the walks the graph stores — unless a hand-authored block removed the direct walk. ([0118](./0118-a-stand-in-is-not-a-shortcut.md))
- **A route can be denied one place, not just a whole network**, dropped as nodes before anything is
  wired. Each excluded entry carries its own words, and the exclusion is always visible. ([0109](./0109-a-route-can-be-denied-one-place.md))
- **A route is drawn as the measurement it is** — straight, dashed, between the nearest pair — and a
  leg with an end that isn't on this map draws nothing. ([0116](./0116-a-route-is-drawn-as-the-measurement-it-is.md))
- **Nothing is silently thinner than it claims.** A build reports one-sided borders, unresolved
  destinations, isolated zones, refused boards and every pairing it made. ([0062](./0062-a-travel-graph-of-zone-lines.md), [0115](./0115-a-border-one-side-could-not-name.md), [0119](./0119-a-pile-of-destinations-is-a-sign.md))

## Reference sources

- **eqlwiki at runtime, cached**, fetched through the main process with a pure parser tuned to the
  real DOM. ([0003](./0003-eqlwiki-runtime-data-source.md))
- **Search ranks against a locally mirrored title index** with a dependency-free fuzzy matcher; the
  server search is only the fallback while the index warms. ([0006](./0006-fuzzy-search-with-title-index.md))
- **Quests-by-zone is backlinks ∩ `Category:Quests`**, unioned over the zone's redirect aliases. ([0007](./0007-quests-by-zone-via-backlinks.md))
- **A generated table is shipped, not fetched.** Expansions, adjacency and zone levels are committed
  files regenerated by a script, over one shared crawl, so a normal launch costs the wiki nothing. ([0065](./0065-a-zone-belongs-to-an-expansion.md), [0117](./0117-the-wiki-says-which-zones-touch.md), [0122](./0122-a-zone-wears-its-levels.md))
- **Lucy is a third rung, asked only where the first two are silent**, quoted rather than believed:
  its rows open rather than add, they reach no rate, and they sit under a heading naming the other
  game. Era is derived from the zones and "unknown" is a real third answer. ([0124](./0124-lucy-is-a-second-opinion.md))
- **Be slow on purpose, cache hard, cache the misses, and never fetch unasked.** One shared polite
  queue; the gate on a borrowed source is at the IPC boundary, because that is a promise a boundary
  can keep. ([0124](./0124-lucy-is-a-second-opinion.md))
- **A long source list is a selection, not a truncation** — judged over all of it first, and the real
  total is shown. ([0124](./0124-lucy-is-a-second-opinion.md))
- **An OCR grab is corrected before it is searched**, one letter at a time first, judged against names
  we know, with raw winning ties and a correction having to clear a floor as well as beat raw. ([0081](./0081-an-ocr-grab-is-corrected-before-it-is-searched.md))

## Alerts

- **A watch is a rule** — a trigger, any number of conditions, a timing — and every field is optional,
  so absent means the old behaviour and nothing needs migrating. ([0084](./0084-a-watch-is-a-rule-not-a-substring.md))
- **A watch may be pointed at raw log lines**, whichever sentences the parsers happen to model. This
  is the escape hatch that covers anything the game prints. ([0050](./0050-a-watch-can-read-a-whole-log-line.md))
- **An exclusion is always `and not`**, a blank row says nothing, and a rule with neither trigger nor
  condition matches nothing. ([0084](./0084-a-watch-is-a-rule-not-a-substring.md))
- **A rule that won't do what it looks like says so, where it was typed.** Expressiveness that fails
  quietly is worse than no expressiveness, and the checker is the only description of what is wrong —
  one call behind both the row's chip and the drawer's list. ([0084](./0084-a-watch-is-a-rule-not-a-substring.md), [0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md), [0087](./0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md))
- **A rule can be replayed against the log**, judged purely and locally so the answer re-computes on
  every keystroke, matched alone with alerts forced on and `now` set to each line's own timestamp. ([0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md), [0089](./0089-a-rule-is-checked-against-the-log-file.md))
- **A shared rule is untrusted, always added, never merged, and carries no style.** Ids are
  regenerated, values checked, strings clamped, lists capped. ([0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md))
- **Only the alert waits.** A delay holds back the banner and nothing else; the meter, the estimate and
  the ledgers take the line the moment it is read. ([0082](./0082-an-alert-can-be-scheduled.md))
- **A delay is stored as the text that was typed**, read by one parser, clamped rather than refused,
  and unreadable text alerts immediately. ([0082](./0082-an-alert-can-be-scheduled.md))
- **A cue in flight belongs to the moment it matched**, keeping the payload it was scheduled with. ([0082](./0082-an-alert-can-be-scheduled.md))
- **A repeat must be stoppable**, enforced in the model rather than in the UI; a cancel is never
  inverted. ([0084](./0084-a-watch-is-a-rule-not-a-substring.md))
- **One look is defined in one place.** A rule wears the defaults, a saved style, or one of its own;
  editing from inside a rule can never restyle another rule, so a shared or sticky style forks. A
  look a feature is built on may be restyled but not renamed or deleted. ([0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md), [0090](./0090-one-style-editor-at-a-time.md), [0120](./0120-a-feature-s-look-is-sticky.md))
- **One editor, wherever a look is worn.** The same drawer opens from a spawn timer, a buff, the
  celebration and the shopping list as from the Alerts tab; an edit from a wearer is the *shared*
  edit and says who it reaches before it happens, and forking is an explicit choice. ([0090](./0090-one-style-editor-at-a-time.md), [0148](./0148-a-look-is-edited-where-it-is-worn.md))
- **A control drawn on the overlay takes its own clicks, and nothing else does.** The window is glass;
  a marked control is solid only while the cursor is on it, and never takes focus from the game. ([0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md), [0147](./0147-an-overlay-control-takes-its-own-clicks.md))
- **Something that can't be styled must still be seen.** An unresolvable `styleId` falls through to
  the defaults; it never drops the alert. ([0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md), [0099](./0099-a-countdown-can-stay-on-screen.md))
- **Wearing and arming are separate questions**, and arming stays on the thing being armed. ([0120](./0120-a-feature-s-look-is-sticky.md))
- **Everything that alerts goes down one path.** A new kind of news is an `event` on the existing
  payload, not a second notification system — inheriting colour, sound, position and wording. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md), [0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md), [0105](./0105-a-tracked-item-says-so-when-it-drops.md))
- **The alert overlay owns the visuals; the always-alive window plays the sound.** A window that is
  never focused cannot unlock Web Audio. ([0035](./0035-cast-alert-overlay-window.md))
- **A caster with an article is a mob; a named caster is opt-in per watch.** The article is the only
  signal one cast line offers, and the toggle sits on the watch. ([0035](./0035-cast-alert-overlay-window.md))
- **Placement lends the overlay a click**, for the moment, and a click always resolves — Esc is the
  graceful out and the state is time-boxed in main. ([0045](./0045-place-a-custom-alert-spot.md), [0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md))
- **A placed spot is a fraction of the display**, referenced from the one `position` field so
  switching never leaves a stale second field behind. ([0045](./0045-place-a-custom-alert-spot.md))
- **A one-time conversion is idempotent and changes what no rule matches**, asserted by matching the
  same events either side of it. ([0087](./0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md))
- **Alerts are edited in a tab and stored in settings.** Where a thing is edited is a different
  question from where it is stored, and the tab label says when the master switch is down. ([0088](./0088-alerts-are-a-tab-not-a-setting.md))
- **Completions come from the log, and nothing is accepted implicitly.** A trie answers per keystroke;
  prefix beats contains beats fuzzy, at a higher floor than the search box uses. ([0091](./0091-a-rule-is-typed-with-the-log-s-help.md))

## Spawn timers

- **A named is recognised by its article, and only when the killer's name lacks one too.** Named-ness
  is a property of the mob, learned once, and it makes every kill already on file evidence. Absent is
  unknown, not plain. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md))
- **The interval is the shortest gap ever seen, never the average.** Every observed gap is an upper
  bound; an average describes your evening. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md))
- **A gap that spans a difficulty change is thrown out**, compared on the raw zone name — the one
  distortion that makes a gap *shorter*, which a falling bound can never recover from. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md))
- **Every kill in your own log tightens a timer, including a bystander's; a peer's never does.** Their
  clock is not yours, and evidence that can't be withdrawn has to be evidence you can't be wrong about. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md))
- **A timer is a due time, not a countdown**, so it survives a restart, a zone change and an app that
  was closed for the whole respawn. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md))
- **A pop that already happened is never alerted retroactively**, and the same check covers every way
  a timer can come into being. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md), [0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md))
- **Padding is the player's, per mob, zero by default**, and re-arms the countdown already running. ([0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md))
- **A sighting is an observation and is used as one** — through the same ratchet, distinct in the
  wording, and not privileged over a tighter kill gap. A consider or a hail counts, on a closed
  vocabulary that fails closed, and only ever for a timer already counting down. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md))
- **`alive` outranks the clock in both directions, and an alive mob never alerts.** `up` is what we
  guessed; `alive` is what you saw. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md))
- **Every measurement can be seen and dropped on its own, down to the individual gap.** A gap is
  derived, so the exclusion is stored; a dropped gap stays listed, struck through. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md))
- **Notify and on-screen are per mob, opt-in, and separate questions.** One is a moment, the other a
  dial. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md), [0099](./0099-a-countdown-can-stay-on-screen.md))
- **Only a hand-added row may be removed**, and what was learned is never deleted — a row the kill log
  produced would simply come back. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md))
- **A countdown is an instance of a camp, addressed by its own id; the camp is what is known.** Gaps,
  sightings, the floor, the stated figure, padding, notify, style and on-screen all stay keyed by the
  mob and the place. ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
- **A camp says whether a fresh kill restarts its countdown or adds another**, defaulting to restart —
  the same question `CastWatch.retrigger` asks of a cue, and the placeholder camp's answer. The number
  of clocks one camp may run is bounded. ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
- **A hand-made timer is its own kind, not a mob with no kills.** It claims nothing about what is a
  named, may repeat, rolls forward rather than coming back overdue, and wears none of a mob's evidence
  controls. Which kind it is, is **asked** — defaulted from your own log's vocabulary, never inferred
  silently. ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
- **A running countdown is derived, so it follows the evidence.** Anything that moves a camp's figure
  — a typed value, a cleared one, a forgotten sighting or floor, a dropped gap, a relearn, fresh
  padding — re-shapes the clocks already running, from each clock's own death, carrying any sighting
  over. With no figure left the clocks go: a countdown to a figure nobody has is the blank clock the
  feature already refuses to create. ([0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md),
  [0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md), [0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
- **A pet and a person are never nameds.** A pet says so in the log's own possessive
  (`<Owner>`s warder`); a person is anyone the log shows killing something *with an article*. Both are
  subtracted when the question is asked, so proof arriving late still applies to a death that came
  early — without which a named that kills your pet or your group-mate puts them on the board with a
  learned respawn. ([0138](./0138-a-replayed-log-narrows-what-a-kill-proves.md))
- **A sighting holds its row for a grace after the later of the by-time and the sighting.** Seeing a
  mob never makes its row leave sooner than the clock alone would; a sighting after the by-time
  carries it past where the countdown gave up; and neither keeps it there for ever. What the sighting
  taught is kept regardless. ([0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md),
  [0138](./0138-a-replayed-log-narrows-what-a-kill-proves.md))
- **A pop is owed for a moment, and a missed moment is not owed.** A timer already stale when it is
  first looked at says nothing — the process was frozen, not the mob — while a **by-time still ahead**
  is a moment nobody has had yet, so padding as long as the interval defers the pop rather than
  swallowing it. ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md),
  [0138](./0138-a-replayed-log-narrows-what-a-kill-proves.md))
- **A kill re-derives its own camp, not every camp**, and a camp lists a bounded number of gaps while
  counting all of them. Both are what makes catching up on a log gap and camping for a month cost what
  one camp costs. ([0138](./0138-a-replayed-log-narrows-what-a-kill-proves.md))
- **A hand-made timer's pop is a `timer`, not a `spawn`.** It keeps the spawn *look* — colour, corner,
  lingering — and drops the claim: no skull, and no "is up" about something that never spawned. A
  place-less timer's wording carries no dangling separator. ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
- **A repop drops the countdowns measuring from a death in that place, and nothing else.** A timer the
  player made is not about a mob. ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
- **A duration has one syntax and a contract per feature** — the units that make sense and the ceiling
  that applies. A cue takes seconds and minutes to half an hour; a timer takes hours and days. What a
  field prints can be typed back into it. ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))

## Buffs

- **A buff is tracked from the log, not configured.** A spell enrols itself the first time you are seen
  casting it, receiving it, or losing it, and arrives switched **on** — the opposite of a spawn timer's
  `notify`, because everything you kill becomes a timer while only what you actually buff lands here.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md))
- **A sentence resolves to candidates, never to a spell.** The game words 272 of its obtainable fade
  sentences for more than one spell. Two things outside the string file narrow them, in order of what
  they prove — one candidate is **already up**, then one was **just cast** — and where neither decides,
  every candidate is named. Picking the first would be a coin toss that reads like knowledge.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md))
- **A pending cast is withdrawn, not left to expire.** A fizzle, interrupt or resist means the cast
  never landed, so the next landing line is somebody else's.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md))
- **A landing on somebody else counts only when you cast it.** That sentence is zone-visible, so at a
  busy camp every nearby caster would otherwise fill your board.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md))
- **Only obtainable, beneficial spells may claim a sentence.** Ungated, the file's NPC and out-of-era
  tiers hand a player's own sentence to a spell nobody here can cast; a detrimental spell's landing is a
  debuff, which is a different feature. ([0140](./0140-a-buff-is-watched-until-it-lapses.md))
- **A lapse is a state, not an event.** A banner answers "what just happened" and goes; the useful fact
  is that you are *now* without it, so a lapse is held until the spell is recast or stood down.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md))
- **A debuff and a buff are opposite on both axes that matter.** A debuff on something you were fighting
  is announced **at once** (a root you don't recast this second is a mob in your casters) and **clears
  when the fight ends** (there is nothing left to re-root). Your own buffs are the reverse: the banner
  **waits for the fight to end**, because nobody stops swinging to rebuff, and the row stays until the
  buff is back. ([0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md))
- **Either the spell or the target may settle which kind it is** — detrimental by the game's file, or a
  mob by its article — and **you and your pet are never enemy targets**, checked first, so a mislabelled
  spell can never sweep away the reminders the feature exists for.
  ([0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md))
- **The standing on-screen list never waits.** Holding a banner is only free because the quiet half is
  already saying it. Interruption and information are separated, not delayed together.
  ([0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md), [0099](./0099-a-countdown-can-stay-on-screen.md))
- **What counts as a fight is the meter's answer, asked not re-derived.** A second opinion built from
  damage events would be the same rule written twice.
  ([0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md), [0036](./0036-a-fight-ends-on-death-not-a-lull.md))
- **No duration threshold decides whether to speak.** "Don't interrupt me about long buffs" is
  implemented as "don't interrupt me about anything I can't act on now", because the first needs a figure
  this app refuses to compute and the second the log answers outright.
  ([0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md))
- **Your death lapses your buffs quietly.** Recorded — "what do I need re-buffed" is the question a
  corpse has — and not announced, because a dozen banners at once is not a dozen pieces of news. Buffs
  you put on other people survive it, and the log reports those itself. A fight that ended by killing
  you says nothing either, including the banners it was holding.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md), [0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md))
- **The duration formula's id is read; a duration is not computed.** Applying the formula is
  server-side logic, and the caster level it needs is one this log will not state — EQL levels are per
  class and the level line names none. So permanence is known, and **no countdown is shown**.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md), [0080](./0080-the-game-s-own-spell-file.md))
- **Unchecking silences and keeps the row; clearing forgets it.** A cleared spell returns if it is cast
  again; an unchecked one never speaks until it is checked. Silencing by deleting is a decision you
  cannot see or undo. ([0140](./0140-a-buff-is-watched-until-it-lapses.md),
  [0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md))
- **The board is not persisted; the choices are.** Which buffs are up is a fact about a login, and
  nothing in the log restates it. Claiming otherwise would invent state the first fade line contradicts.
  ([0140](./0140-a-buff-is-watched-until-it-lapses.md), [0043](./0043-state-is-not-news-either.md))

## Windows and the interface

- **An Electron shell around a static-export renderer.** Main does windows, filesystem and fetching;
  the renderer talks to it only through the typed `window.eql` preload bridge, with
  `contextIsolation` on and `nodeIntegration` off. Production serves `out/` over a privileged
  `app://` scheme. ([0002](./0002-electron-shell-over-nextjs.md), [0005](./0005-renderer-static-export-and-app-protocol.md))
- **One translucent always-on-top window plus a tray.** Closing hides; the tray owns Quit and the
  debug actions. ([0009](./0009-single-window-with-tray.md))
- **One in-app navigation history, one link action.** Only an explicit ↗ leaves the app, and the
  overlay deliberately does not participate. ([0008](./0008-in-app-page-navigation.md))
- **An error goes to the log, not over the game.** Every full-viewport error UI on an always-on-top
  window is a blackout of the game, so the dev overlay is killed from the main process, errors go to
  the debug file by all three routes, and a crash fallback is silent in the windows that cover a
  display. The one exception is a launch that produces no window at all. ([0052](./0052-an-error-goes-to-the-log-not-the-screen.md), [0110](./0110-a-launched-window-is-visible-or-it-says-why.md))
- **A window that cannot be operated does not keep the screen.** Crashed, hung, failed-to-load and an
  HTTP error are one fact; `makeHarmless` is unconditional, pure overlays are destroyed and rebuilt
  once, the app's own windows are stripped and reloaded once, and recovery means a page was *served*. ([0110](./0110-a-launched-window-is-visible-or-it-says-why.md), [0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md))
- **A launched window is visible or it says why**, shown by a latch rather than an event, with a page
  that cannot fail to load as the last resort. ([0110](./0110-a-launched-window-is-visible-or-it-says-why.md))
- **A main-process crash neutralizes every overlay before carrying on.** A broken feature beats losing
  the app, and losing the app beats a desktop that will not take a click. ([0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md))
- **A lookup never holds the screen longer than it is useful.** The screen's budget and the read's are
  separate numbers; a selector is shown only when the renderer says it is listening; going away is
  `destroy()`, never `close()`; and Escape has three routes out. ([0102](./0102-a-lookup-never-holds-the-screen.md))
- **Click-through is per window, with the hole being the content**, stated by what passes through
  rather than by what stays solid, and a press holds the window. The renderer decides, main obeys. ([0032](./0032-remove-dead-overlay-surface.md), [0073](./0073-a-click-through-window-keeps-its-chrome.md))
- **How a window was left is window state, not a setting.** Main applies it at creation so the first
  click lands where the user left it; the renderer owns it afterwards through one hook, and applies
  nothing before the saved value arrives. Remembering and applying stay separate channels. ([0074](./0074-how-a-window-was-left-is-window-state.md))
- **The interface scale only shrinks, and it is a CSS `zoom` per window.** One shared range, one
  clamp, read by every consumer. ([0026](./0026-interface-scale-only-shrinks.md), [0041](./0041-interface-scale-is-a-css-zoom-per-window.md))
- **A frameless window snaps like a framed one.** The renderer owns the gesture and main owns the
  window, with no coordinate crossing between them; the cursor decides, and ending a drag is three
  different things the renderer names. ([0108](./0108-a-frameless-window-snaps-like-a-framed-one.md))
- **A panel's height belongs to its reader.** Bounded by default, dragged to a *share* of the window
  rather than a pixel count, remembered per panel, and scrolling whatever doesn't fit. ([0112](./0112-a-panel-s-height-belongs-to-its-reader.md))
- **A measurement is converted once, at the boundary, into the units a style is written in**, and a
  popover is anchored to the words rather than the element. ([0123](./0123-a-popover-is-placed-in-the-units-it-is-written-in.md))
- **A countdown pinned to the screen rides the existing alert overlay**, wearing the same style and
  sitting where its own alert would, with the banner drawing over it. ([0099](./0099-a-countdown-can-stay-on-screen.md))
- **A toast is read, never acted on; it always leaves by itself; and it is never the only place
  something is said.** ([0106](./0106-an-add-says-what-it-did.md))
- **A tab is promoted by position, not into a menu**, and the overflow collapses from the end. ([0088](./0088-alerts-are-a-tab-not-a-setting.md))

## Peers

- **The main window owns the single connection and the main process is a pure relay.** The bridge is
  generic; map semantics stay in the map area. The owner drops its own echoes. ([0012](./0012-awari-connection-owned-by-main-window.md))
- **Peer sharing is opt-in and default off**, and off means no traffic at all. ([0011](./0011-awari-peer-location-sharing.md), [0012](./0012-awari-connection-owned-by-main-window.md))
- **Presence comes from the roster; identity comes from a `hello`.** A peer with no `hello` is still
  listed. Presence is a fact on its own; the name is an enrichment. ([0015](./0015-peer-presence-via-hello.md))
- **A greeting is answered once per peer**, which is what stops two clients greeting each other
  forever. ([0028](./0028-peer-networking-verified-and-repaired.md))
- **A publish made before the room is up is held, not dropped** — the last payload of each kind,
  because these are all "here is my current state". ([0028](./0028-peer-networking-verified-and-repaired.md), [0070](./0070-a-dropped-room-rejoins-itself.md))
- **Being alone is a resting state and settles; being disconnected is not and heals.** Lonely retries
  are bounded with wide jitter; recovery is unbounded at one attempt a minute. ([0028](./0028-peer-networking-verified-and-repaired.md), [0070](./0070-a-dropped-room-rejoins-itself.md))
- **We name our own ICE servers**, built from awari's shipped presets, as one constant that reverting
  means editing. ([0046](./0046-our-own-ice-servers-not-peerjs-defaults.md))
- **A contributor has an id, minted per install, and everything they tell us is filed under it.** A
  name is a label, never a key; reading an identity fails closed; the id rides only on contributed
  payloads, never on `hello`. ([0132](./0132-a-contribution-is-keyed-by-who-made-it.md))
- **A report replaces that contributor's set**, an empty report keeps what it taught, arrivals are
  vetted and each contributor is capped. ([0132](./0132-a-contribution-is-keyed-by-who-made-it.md))
- **Provenance is shown, not scored.** Peers' data is stored, always attributed, and removable; every
  merged figure reports how much of it you saw yourself. ([0024](./0024-mob-knowledge.md), [0132](./0132-a-contribution-is-keyed-by-who-made-it.md))

## Stored data

- **Derive, don't duplicate.** One record of the facts; every view is a roll-up of it. Replaying facts
  can rebuild any view; the reverse isn't true. ([0016](./0016-combat-history-and-spell-analytics.md), [0024](./0024-mob-knowledge.md), [0053](./0053-damage-is-cells-rolled-up.md))
- **A store that changes on every kill lives in its own small file**, not in the reactive settings
  store — which would spam every window and rebuild the tray. ([0017](./0017-camp-efficiency-and-asking-the-player.md), [0074](./0074-how-a-window-was-left-is-window-state.md))
- **Every store writes a provenance stamp, written first**, so a report about a megabyte file costs a
  window from the head of it. Stamped in the shared writer, not by each store. ([0096](./0096-stored-data-says-which-rules-wrote-it.md))
- **A revision is per concern and is not the app version, nor a schema.** A schema is what the app can
  repair by itself, silently; a revision is what it cannot, so it says so. ([0096](./0096-stored-data-says-which-rules-wrote-it.md))
- **An unstamped file is assumed current**, and data from a newer build is `ahead`, not stale, and is
  offered nothing. ([0096](./0096-stored-data-says-which-rules-wrote-it.md))
- **A remedy names who can act**, and one nobody can act on is not counted in the badge. ([0096](./0096-stored-data-says-which-rules-wrote-it.md))
- **A concern may declare itself `unattended`**, and a start that finds it stale puts it right without
  asking — after the window has painted. A declared remedy that is a no-op is worse than none. ([0128](./0128-a-fight-is-re-derived-not-refused.md), [0129](./0129-a-release-can-ask-for-a-re-read.md))
- **Caps bound detail, never knowledge**, and an unbounded store is refused because the whole file is
  rewritten on a debounce. ([0056](./0056-a-dropped-record-keeps-what-it-taught.md))
- **A ledger needs filters and a column to sort by**, one filter object applied by one function so the
  tallies and the rows describe the same set, and a stable sort because the log stamps to the second. ([0058](./0058-a-ledger-needs-filters-and-a-column-to-sort-by.md))

## Build and diagnostics

- **CI gates on typecheck, lint and test, then publishes one rolling `latest` Windows build.** A
  broken commit must not become the download. ([0013](./0013-ci-rolling-latest-windows-build.md))
- **Every build has a number, stamped by the pipeline and never committed**, and "newer" is a numeric
  `>` on the version. Unreadable is "nothing to report". ([0064](./0064-every-build-has-a-number.md))
- **Notify, with a link — never install on the user's behalf**, and never flag the same build twice. ([0034](./0034-update-notification.md), [0064](./0064-every-build-has-a-number.md))
- **A broken update check is silent** and must never delay startup. ([0034](./0034-update-notification.md), [0064](./0064-every-build-has-a-number.md))
- **A setup check is a chain, and it names the first broken link.** A step whose prerequisite failed
  is not run; rows are in dependency order; a warning does not block; every step says what it found
  even on a pass. It runs on demand only. ([0100](./0100-a-setup-check-is-a-chain.md))
- **Debug output goes through `logging.ts`, off by default and easy to turn on.** ([0052](./0052-an-error-goes-to-the-log-not-the-screen.md), [0079](./0079-an-unread-line-is-counted-by-its-shape.md))
- **No magic numbers.** Every threshold, cap, factor and unit conversion is a named constant with the
  reasoning attached, and a size belongs in the stylesheet. ([0087](./0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md))
- **A rule worth testing is a pure black box beside the thing that uses it**, pinned by its tests and
  changed only deliberately. ([0004](./0004-log-watching-strategy.md), [0006](./0006-fuzzy-search-with-title-index.md), [0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md))
- **A working, tested black box is not rewritten to adopt a newer abstraction.** What it gains is the
  *option*, taken next time it changes for its own reasons. ([0107](./0107-an-inferred-number-has-rules-and-they-are-shared.md))
