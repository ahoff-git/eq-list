# Decisions

Architecture Decision Records in the Michael Nygard format. Numbers are sequential and immutable;
supersede rather than edit an `Accepted` decision, and say so in the superseded record's own
`## Status` as well as here.

**[requirements.md](./requirements.md) is the consolidation** — every rule these records still hold,
stated once, grouped by area, each citing where it came from. Read that to find out what the app is
supposed to do; read a record here to find out *why*, and what was rejected on the way.

An entry below is one line. A decision's reasoning belongs in the record, not in the index to it.

## Retired and reused numbers

**0049 is deliberately absent.** It recorded a pathfinding experiment on the map's geometry that was
removed rather than kept, and the record went with it. The number is retired, not free. It stays
retired: [0062](./0062-a-travel-graph-of-zone-lines.md) routes between zones over the mapmakers'
**exit labels**, which is different data with a different provenance, and still does no routing
inside one.

**0105 and 0120 were each issued twice**, by two pieces of work landing the same afternoon. The
earlier record of each pair keeps its number; the later one moved to the end of the sequence, which
is the only resolution that leaves every citation in the code still pointing at what it meant:

| issued as | now | title |
| --- | --- | --- |
| 0105 | **0131** | [An overlay that cannot be operated does not keep the screen](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) |
| 0120 | **0132** | [A contribution is keyed by who made it, and kept](./0132-a-contribution-is-keyed-by-who-made-it.md) |

The lesson is cheap to apply: **take the next number when the file is created**, not when the work is
finished, so a number is claimed before a second author can reach for it.

## Log
- [0001: Record architecture decisions as ADRs](./0001-record-architecture-decisions.md)
- [0002: Electron desktop shell over the existing Next.js app](./0002-electron-shell-over-nextjs.md)
- [0003: eqlwiki.com as a runtime, cached data source](./0003-eqlwiki-runtime-data-source.md)
- [0004: Poll-and-tail log watching with a pure parser](./0004-log-watching-strategy.md)
- [0005: Static-export renderer served over an app:// protocol](./0005-renderer-static-export-and-app-protocol.md)
- [0006: Fuzzy search over a cached title index](./0006-fuzzy-search-with-title-index.md)
- [0007: Quests-by-zone via backlinks ∩ Category:Quests](./0007-quests-by-zone-via-backlinks.md)
- [0008: In-app page navigation with a history stack](./0008-in-app-page-navigation.md)
- [0009: One translucent window + a system tray (merge overlay and control window)](./0009-single-window-with-tray.md) — *its `clickThrough` retention reversed by 0032; the working feature is 0073*
- [0010: Port eq-map's map core; show the map in a sibling window](./0010-ported-map-core.md) — **superseded by 0042** for the image core; the `/loc` feed and the map window stand
- [0011: Opt-in peer location sharing over awari](./0011-awari-peer-location-sharing.md) — **superseded by 0012**
- [0012: awari connection owned by the main window, brokered over IPC](./0012-awari-connection-owned-by-main-window.md)
- [0013: CI publishes a rolling "latest" Windows build](./0013-ci-rolling-latest-windows-build.md)
- [0014: Damage meter parsed from the log, with log-time fights](./0014-damage-meter-from-the-log.md)
- [0015: Peer presence from awari's roster, names from a `hello` payload](./0015-peer-presence-via-hello.md)
- [0016: Combat history on disk, and spell efficiency derived from the log](./0016-combat-history-and-spell-analytics.md)
- [0017: Camp-efficiency analytics, and asking the player for what the log can't say](./0017-camp-efficiency-and-asking-the-player.md)
- [0018: Maximum hit points inferred from the log, stored softly](./0018-inferred-max-hit-points.md)
- [0019: Parse each log line once, and let one tracker own the session](./0019-parse-once-and-one-tracker.md)
- [0020: Split every tally by stance and invocation](./0020-split-by-stance-and-invocation.md)
- [0021: Stored fights keep a pointer back to their source lines](./0021-stored-fights-keep-their-source.md) — *its `logIds` handle corrected by 0128*
- [0022: Invocation side-effects, and placing kills honestly](./0022-invocation-effects-and-kill-locations.md)
- [0023: The kill heatmap — show the doubt, share the conclusion](./0023-kill-heatmap.md)
- [0024: Mob knowledge — observed drop rates and roam areas, pooled with peers](./0024-mob-knowledge.md)
- [0025: Observation outranks the wiki, and disagreements are shown](./0025-observation-over-the-wiki.md)
- [0026: The interface scale only shrinks, and it scales the window, not the font](./0026-interface-scale-only-shrinks.md) — *re-implemented by 0041; the ceiling stands*
- [0027: Only your own kills count, and the log has to say whose they were](./0027-only-your-kills-count.md)
- [0028: Peer networking, actually run](./0028-peer-networking-verified-and-repaired.md)
- [0029: Three measurements corrected by replaying the whole log](./0029-measurements-corrected-against-the-log.md)
- [0030: A log line that already happened is history, not news](./0030-history-is-not-news.md) — *qualified by 0043, partly reversed by 0044*
- [0031: An inferred bound has to be able to come back down](./0031-an-inferred-bound-must-be-able-to-fall.md)
- [0032: Remove the retained-but-dead overlay/click-through surface](./0032-remove-dead-overlay-surface.md)
- [0033: Eating a log is idempotent — every kill and drop is keyed by its line](./0033-eating-a-log-is-idempotent.md) — *extended to fights by 0055, narrowed by 0128*
- [0034: Tell the user a newer build exists; don't install it for them](./0034-update-notification.md) — **superseded by 0064**; notify-with-a-link stands
- [0035: Cast alerts get their own click-through overlay window, over the game](./0035-cast-alert-overlay-window.md)
- [0036: A fight ends on a death, not on a lull](./0036-a-fight-ends-on-death-not-a-lull.md)
- [0037: A zone is one place; its layers are a user choice, not a log fact](./0037-one-zone-many-layers.md) — **superseded by 0042**; the `layer` field survives as 0040's floors
- [0038: A map has a scale and a centre, and you calibrate it by clicking](./0038-a-map-has-a-scale-and-a-centre.md) — **superseded by 0042**; `scale`/`center` survives as `MapProjection`
- [0039: Render the game's own map files, and let the player choose whose maps](./0039-render-the-game-s-own-maps.md)
- [0040: Floors come from the mapmaker's labels, not from the geometry](./0040-floors-come-from-the-mapmaker.md)
- [0041: The interface scale is a CSS zoom per window, not Chromium's](./0041-interface-scale-is-a-css-zoom-per-window.md)
- [0042: Only the game's own maps — the bundled scans are gone](./0042-only-the-game-s-own-maps.md)
- [0043: Where you are is state, not news — recover it, replay nothing](./0043-state-is-not-news-either.md)
- [0044: The read position outlives the app — a gap is news, not history](./0044-the-log-position-outlives-the-app.md)
- [0045: Place a custom alert spot by lending the overlay a click](./0045-place-a-custom-alert-spot.md)
- [0046: We name our own ICE servers, because PeerJS's defaults are not ours to trust](./0046-our-own-ice-servers-not-peerjs-defaults.md)
- [0047: Money is copper, counted in two ledgers](./0047-money-is-copper-in-two-ledgers.md)
- [0048: A map label is read by its words, and a bracket it can't read defers](./0048-a-map-label-is-read-by-its-words.md)
- [0050: A watch can read a whole log line, not just a spell](./0050-a-watch-can-read-a-whole-log-line.md) — *its substring superseded by 0084; raw log lines stand*
- [0051: An index is maintained, not re-derived — and a change announces itself](./0051-an-index-is-maintained-and-a-change-announces-itself.md)
- [0052: An error goes to the log, not over the game](./0052-an-error-goes-to-the-log-not-the-screen.md)
- [0053: Damage is stored as cells and rolled up, not as a breakdown per combatant](./0053-damage-is-cells-rolled-up.md)
- [0054: A play session is a login, and a fight is named after what we fought](./0054-a-sitting-is-a-login.md)
- [0055: Eating a log is a catch-up — it fills every bucket it can](./0055-eating-a-log-fills-history.md)
- [0056: A dropped record keeps what it taught](./0056-a-dropped-record-keeps-what-it-taught.md)
- [0057: A grade is not an identity, and neither is a difficulty](./0057-a-grade-is-not-an-identity.md)
- [0058: A ledger needs filters and a column to sort by](./0058-a-ledger-needs-filters-and-a-column-to-sort-by.md)
- [0059: A zone's variants are one zone](./0059-a-zone-s-variants-are-one-zone.md) — *its `keyOf` fold superseded by 0083*
- [0060: A position belongs to the zone it was taken in](./0060-a-position-belongs-to-the-zone-it-was-taken-in.md)
- [0061: A map pack names its own zones](./0061-a-map-pack-names-its-own-zones.md)
- [0062: A travel graph of zone lines — route between zones, never inside one](./0062-a-travel-graph-of-zone-lines.md)
- [0063: A zone the pack lacks is borrowed from the game's own maps](./0063-a-zone-the-pack-lacks-is-borrowed.md)
- [0064: Every build has a number, and "newer" is a comparison](./0064-every-build-has-a-number.md)
- [0065: A zone belongs to an expansion, and that's how we know it exists](./0065-a-zone-belongs-to-an-expansion.md)
- [0066: A port is cast from where you stand](./0066-a-port-is-cast-from-where-you-stand.md)
- [0067: The damage meter counts your party's fights, not the camp's](./0067-the-meter-counts-your-party-s-fights.md)
- [0068: A zone name resolves against what we know](./0068-a-zone-name-resolves-against-what-we-know.md)
- [0069: A succor is a port inside one zone](./0069-a-succor-is-a-port-inside-one-zone.md)
- [0070: A dropped room re-joins itself](./0070-a-dropped-room-rejoins-itself.md)
- [0071: A DoT tick belongs to whoever cast it](./0071-a-dot-tick-belongs-to-whoever-cast-it.md)
- [0072: A folder of maps is named once and remembered](./0072-a-folder-of-maps-is-named-once-and-remembered.md)
- [0073: A click-through window keeps its chrome](./0073-a-click-through-window-keeps-its-chrome.md)
- [0074: How a window was left is window state, not a setting](./0074-how-a-window-was-left-is-window-state.md)
- [0075: A zone's misspelling is the same zone](./0075-a-zone-s-misspelling-is-the-same-zone.md) — *its frequency keying superseded by 0083; the filter stands*
- [0076: A supplied gazetteer outranks our guesses](./0076-a-supplied-gazetteer-outranks-our-guesses.md)
- [0077: A pet is proven, not guessed](./0077-a-pet-is-proven-not-guessed.md)
- [0078: A fight records why it ended](./0078-a-fight-records-why-it-ended.md)
- [0079: An unread line is counted by its shape](./0079-an-unread-line-is-counted-by-its-shape.md)
- [0080: The game's own spell file](./0080-the-game-s-own-spell-file.md)
- [0081: An OCR grab is corrected before it is searched](./0081-an-ocr-grab-is-corrected-before-it-is-searched.md)
- [0082: An alert can be scheduled, not just raised](./0082-an-alert-can-be-scheduled.md) — *grown by 0084 into cancels, retriggers and repeats*
- [0083: A zone name is stored raw and grouped on read](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)
- [0084: A watch is a rule, not a substring](./0084-a-watch-is-a-rule-not-a-substring.md)
- [0085: A rule can be tested, shared and borrowed](./0085-a-rule-can-be-tested-shared-and-borrowed.md) — *its recent-lines buffer superseded by 0089; styles refined by 0086 and 0090*
- [0086: Editing a shared style from a rule forks it](./0086-editing-a-shared-style-from-a-rule-forks-it.md)
- [0087: An old rule is converted once, and the alert path is one module](./0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md)
- [0088: Alerts are a tab, not a setting](./0088-alerts-are-a-tab-not-a-setting.md)
- [0089: A rule is checked against the log file, not against this session](./0089-a-rule-is-checked-against-the-log-file.md)
- [0090: One style editor at a time, opened by a button](./0090-one-style-editor-at-a-time.md)
- [0091: A rule is typed with the log's help](./0091-a-rule-is-typed-with-the-log-s-help.md)
- [0092: A named's respawn is learned from your own kills](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)
- [0093: A high score is a personal best, per character, with a floor](./0093-a-high-score-is-a-personal-best-with-a-floor.md)
- [0094: A spawn timer is a window, not an instant, and the player sizes it](./0094-a-spawn-timer-is-a-window-not-an-instant.md)
- [0095: Your own DoT tick is yours, because the log says so](./0095-your-own-dot-tick-is-yours.md)
- [0096: Stored data says which rules wrote it, and a revision is not a build number](./0096-stored-data-says-which-rules-wrote-it.md)
- [0097: A sighting is the tightest evidence there is, and a timer is silent until asked](./0097-a-sighting-is-the-tightest-evidence-there-is.md)
- [0098: A mob is a thing you hunt, not a thing that drops](./0098-a-mob-is-a-thing-you-hunt.md)
- [0099: A countdown can stay on screen, and a timer picks a saved look](./0099-a-countdown-can-stay-on-screen.md)
- [0100: A setup check is a chain, and it names the first broken link](./0100-a-setup-check-is-a-chain.md)
- [0101: An item page says who dropped it, and where-ish](./0101-an-item-page-says-who-dropped-it.md)
- [0102: A lookup never holds the screen longer than it is useful](./0102-a-lookup-never-holds-the-screen.md)
- [0103: Search can answer from your own log, and an item with no page still has one](./0103-search-can-answer-from-your-own-log.md)
- [0104: A position is readable, and opening one brings its evidence with it](./0104-a-position-is-read-and-arrives-with-its-evidence.md)
- [0105: A tracked item says so when it drops](./0105-a-tracked-item-says-so-when-it-drops.md)
- [0106: An add says what it did](./0106-an-add-says-what-it-did.md)
- [0107: An inferred number has rules, and they are shared](./0107-an-inferred-number-has-rules-and-they-are-shared.md)
- [0108: A frameless window snaps like a framed one](./0108-a-frameless-window-snaps-like-a-framed-one.md)
- [0109: A route can be denied one place, not just a whole network](./0109-a-route-can-be-denied-one-place.md)
- [0110: A launched window is visible, or it says why](./0110-a-launched-window-is-visible-or-it-says-why.md)
- [0111: One zone, one map file](./0111-one-zone-one-map-file.md)
- [0112: A panel's height belongs to its reader](./0112-a-panel-s-height-belongs-to-its-reader.md)
- [0113: The graph is drawn on the map it was read from](./0113-the-graph-is-drawn-on-the-map-it-was-read-from.md)
- [0114: A conveyance the map calls dead is not one](./0114-a-conveyance-the-map-calls-dead-is-not-one.md)
- [0115: A border only one side could name is named by the other side](./0115-a-border-one-side-could-not-name.md)
- [0116: A route is drawn as the measurement it is](./0116-a-route-is-drawn-as-the-measurement-it-is.md)
- [0117: The wiki says which zones touch, and never where](./0117-the-wiki-says-which-zones-touch.md)
- [0118: A stand-in is not a shortcut](./0118-a-stand-in-is-not-a-shortcut.md)
- [0119: A pile of destinations at one spot is a sign](./0119-a-pile-of-destinations-is-a-sign.md)
- [0120: A feature's look is sticky, and the tab says who wears what](./0120-a-feature-s-look-is-sticky.md)
- [0121: A mob is a range of levels, so its bounds widen](./0121-a-mob-is-a-range-of-levels.md)
- [0122: A zone wears its levels, as the wiki wrote them](./0122-a-zone-wears-its-levels.md)
- [0123: A popover is placed in the units it is written in](./0123-a-popover-is-placed-in-the-units-it-is-written-in.md)
- [0124: Lucy is a second opinion, asked last and quoted rather than believed](./0124-lucy-is-a-second-opinion.md)
- [0125: A hunt is two questions, so the page turns round](./0125-a-hunt-is-two-questions.md)
- [0126: A fight is filed when it ends, not when the next one starts](./0126-a-fight-is-filed-when-it-ends.md)
- [0127: An unknown name is held, not dropped](./0127-an-unknown-name-is-held-not-dropped.md)
- [0128: A fight is re-derived, not refused](./0128-a-fight-is-re-derived-not-refused.md)
- [0129: A release can ask for a re-read, and the next start does it](./0129-a-release-can-ask-for-a-re-read.md)
- [0130: Data in doubt says so, and so does everything computed from it](./0130-data-in-doubt-says-so.md)
- [0131: An overlay that cannot be operated does not keep the screen](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) — *issued as 0105 and renumbered — see Retired and reused numbers*
- [0132: A contribution is keyed by who made it, and kept](./0132-a-contribution-is-keyed-by-who-made-it.md) — *issued as 0120 and renumbered — see Retired and reused numbers*
- [0133: The log is an index, and the rules live in one consolidated file](./0133-the-log-is-an-index-and-the-rules-are-consolidated.md)
- [0134: A map reference resolves to a place, never to a name we couldn't read](./0134-a-map-reference-resolves-to-a-place.md)
- [0135: A countdown is an instance, and a hand-made timer is its own kind](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)
- [0136: Logged data says where it happened, and how hard it was there](./0136-logged-data-says-where-it-happened.md)
- [0137: A filed drop can still learn where it was](./0137-a-filed-drop-can-still-learn-where-it-was.md)
- [0138: A replayed log narrows what a kill proves, and how long a sighting holds a row](./0138-a-replayed-log-narrows-what-a-kill-proves.md)
- [0139: A difficulty can never cost you a map](./0139-a-difficulty-can-never-cost-a-map.md)
- [0140: A buff is watched until it lapses, and the game's own words name it](./0140-a-buff-is-watched-until-it-lapses.md)

## Open Questions

- **Should a repop say what it took?** Changing the instance difficulty rebuilds the world, so every
  countdown measuring from a death in that place is dropped
  ([0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)) — now only the mob ones
  ([0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)). It happens **silently**,
  which was defensible when a camp had one clock and is less so now a placeholder camp can lose eight
  at once: the player sees an empty board and no reason for it. A toast would be the obvious answer
  and the app is careful about spending them; the alternative is a line on the tab itself, which is
  the one place nobody is looking at the moment it happens.

- A zone states what level its monsters are, and we never check it
  ([ADR 0122](./0122-a-zone-wears-its-levels.md)). `mob-knowledge` is accumulating observed level
  ranges per mob ([ADR 0121](./0121-a-mob-is-a-range-of-levels.md)), so "the zone's page says 30-45
  and you have conned five things here at 12" is a comparison we could make — the same
  report-don't-resolve shape as a drop rate. Worth surfacing, or is a zone's range too coarse a claim
  to be contradicted by whatever happened to be conned in one camp?

- Should a **group-mate's** drop reach your overlay? [ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md) can only speak about **your** loot, because that is all the log ever names — and the request it came from was "tell me when one of *us* loots it". The room already carries pooled observations ([ADR 0024](./0024-mob-knowledge.md)) and per-peer kill locations, so a `loot` message kind is small; what needs deciding is everything around it. Whose list does an arriving drop credit — nobody's, or the asker's, given [ADR 0027](./0027-only-your-kills-count.md) says only your own kills count for you? It is a **privacy default** in the same family as `shareLocation`, and a louder one: a location is where you are, a drop is what you have. And it can only ever be partial, since a peer not running the app is invisible while sitting in the same group — which makes silence indistinguishable from "they didn't loot it".

- **Can a celebration exist without a number to beat?** The scoreboard
  ([0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md)) is built entirely on *magnitude*: a
  category, a figure, a floor, and a previous value to clear. A sweep of a real log turned up two
  moments that plainly deserve a banner and have **no figure at all** — `You have been knocked
  unconscious!` **survived** (26 knockouts in three weeks, 4 of them lived through), and killing a
  **named** (27 distinct). Neither is a personal best; both are the best stories in the log. Either the
  board grows a second kind of row — a *moment*, counted rather than measured — or these belong to a
  separate feed and the scoreboard stays strictly about magnitudes. Worth settling before either gets
  built, because the answer decides whether `HighScore` gains an optional value or a sibling type does.
  Both candidates are written up in [ideas.md](../ideas.md) `## More high scores`.

*The three below came out of reading the other EQ Legends tools ([neighbours.md](../neighbours.md));
the work they'd unblock is in [todo.md](../todo.md) `## From the neighbours, second pass`. The
fourth — whether to read installed game files beyond `maps/` — was **settled by
[ADR 0080](./0080-the-game-s-own-spell-file.md)**: yes, bounded to the columns a patch can't move,
and degrading to blank facts when the file isn't there.*
- **Is a second reference source worth taking from a different game?** The *shape* is settled:
  [ADR 0124](./0124-lucy-is-a-second-opinion.md) took Lucy as a third rung — asked last, quoted
  rather than believed, in its own block, reaching no rate. What is still open is whether the
  **Project Quarm distillation** a neighbour ships is worth taking on those terms. It is richer than
  the wiki on the three things we most want seeded — named spawn points, respawn timers, drop
  percentages — and is EQL's lineage rather than EQL. Against it: the wiki is at least *edited by
  people playing this game*. Also a licensing question, not just a design one.

- **Does a dungeons-only guide line reopen in-zone routing?** ADR 0049 was retired and
  [ADR 0062](./0062-a-travel-graph-of-zone-lines.md) narrowed the map's non-responsibility to "no
  routing inside a zone", because an `L` record is a wall in a dungeon and a contour outdoors, so a
  drawn route is a guess dressed as advice. A neighbour ships one anyway and it doesn't refute the
  objection — it paths *along the drawn lines*, which parallels a corridor and traces a hillside. But
  the objection is really about *outdoors*: where the geometry is known to be walls, the guess is
  sound. If we end up reading `spells_us.txt` we get `zone_type` (outdoor/dungeon) for free. Is a route
  that refuses to draw outdoors a different enough claim to be worth costing, or does a feature that
  works in half the world read as broken in the other half?
- **Should interface scale grow as well as shrink?**
  [ADR 0026](./0026-interface-scale-only-shrinks.md) caps at 100% — the overlay's job is to take less
  of the screen, and a magnified overlay is a bigger thing between the player and the game. Two
  neighbours ship the opposite hard: presets at 100 / 200 / 250%, with layouts that grow rather than
  clip, offered in the same menu as the theme. They are serving the same players we are, and EQ's
  audience is twenty-five years older than it was. Is our cap a considered stance or an untested
  assumption?

- **OCR beyond item lookup — is a live health trace wanted?** It's ruled out for the **experience
  bar** (the log's gains plus a level-up baseline solve it exactly,
  [ADR 0017](./0017-camp-efficiency-and-asking-the-player.md)) and for **mana cost** (the wiki states
  it — see [ideas](../ideas.md)), and **maximum health** is now *inferred* from what you survive
  ([ADR 0018](./0018-inferred-max-hit-points.md)). So the only prize left is a health trace rather
  than a maximum, and it needs a user-calibrated screen region per UI layout, is fragile across
  resolutions and UI mods, may capture nothing in exclusive fullscreen, and a confidently wrong
  reading is worse than a blank.
- **Items per kill, alongside the drop chance.** `drops` counts kills that produced an item, which is
  the right numerator for a probability but throws away the stack size — "You looted 2 Spiderling
  Eye" counts once ([ADR 0024](./0024-mob-knowledge.md)). For a stackable trash drop the useful
  figure is items-per-kill. It's a second number rather than a correction, and it changes the shared
  observation shape, so it wants deciding rather than sneaking in.
- The app now reports its peer connection truthfully, but **nothing displays it**
  ([ADR 0070](./0070-a-dropped-room-rejoins-itself.md)): the map's `connected` is the
  `connectPeers` *setting*, and the only consumer of the real status is the room clearing itself.
  During an outage a player sees the user list empty and their pings stop landing, with nothing
  saying why. Is that worth a real connection light, or is a silent self-heal the right amount of
  noise for a game overlay?
- A recovering peer re-joins under a **fresh peer id**, so the room sees a stranger arriving rather
  than a return ([ADR 0070](./0070-a-dropped-room-rejoins-itself.md), on ADR 0011's "the id is
  transport-only"). Cheap today; if reconnects prove frequent it reads as churn in the 👥 panel.
  Should a session keep its id across a recovery?
- A succor point can be **read** off a map and never written down
  ([ADR 0069](./0069-a-succor-is-a-port-inside-one-zone.md)), because `TravelPlace` carries no
  coordinates and an unplaced safe point is a guess that can beat a measured walk. Should a
  hand-authored place be able to state a `/loc` — which would also let `manual-links.ts` place the
  docks it currently has to invent?
- The `fuzzy` tier of `resolveZone` currently fires on **nothing** across all 344 shipped zones
  ([ADR 0068](./0068-a-zone-name-resolves-against-what-we-know.md)) — every name it could reach,
  the three tiers above it already reached. Is a last resort that has never spoken worth carrying,
  or should it wait until a source we don't yet read gives it something to do?
- Should the Damage tab **say** whose fights it's counting — a line naming the party it
  believes you're in ([ADR 0067](./0067-the-meter-counts-your-party-s-fights.md))? The filter is
  always on and silent, so a group line the server words differently than we expect looks like
  a meter that's merely quiet about a group-mate. Against it: the roster is evidence, not truth,
  and showing it invites reading it as the game's own group window.
- A line watch is a substring of the whole log line, and nothing rate-limits it
  ([ADR 0050](./0050-a-watch-can-read-a-whole-log-line.md)). A careless one ("hit") fires
  thousands of times a night. Is the overlay's four-banner cap enough, or does a watch want a
  cooldown — and if so, per watch or per matched sentence? Two later decisions sharpen it without
  answering it: a delay ([ADR 0082](./0082-an-alert-can-be-scheduled.md)) means such a watch now
  *queues* its noise instead of merely making it, and conditions
  ([ADR 0084](./0084-a-watch-is-a-rule-not-a-substring.md)) give a careless watch a way to be
  narrowed rather than throttled — so a cooldown would have to say whether it gates the match or the
  firing, and whether narrowing is simply the better answer.
- Open Relay's community TURN is best-effort and not production-grade
  ([ADR 0046](./0046-our-own-ice-servers-not-peerjs-defaults.md)). Is peer sharing worth
  running our own TURN for, or is "works for most, fails for symmetric NAT" acceptable?
- Pooled mob knowledge is attributed and forgettable, but unweighted: every peer counts the
  same. Should contributions be weighted, or individual peers mutable/vetoable?
  See [ADR 0024](./0024-mob-knowledge.md). **Now answerable**: contributions have a stable key to
  hang a weight or a veto on ([ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md)), and
  `forgetPeers(id)` already drops one contributor. What is still undecided is whether a *weight* is
  honest at all — ADR 0132 argues a per-peer trust score would be a made-up number wearing an
  authoritative face, and that showing provenance and reporting disagreement is the truthful
  version. A per-contributor **mute** is the narrower question left: it needs no invented number.
- What should a contributor be, when one person plays three characters
  ([ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md))? The id is per **install**, which
  matches where the data comes from — one kill log, one machine. It also means the same person on a
  second PC is two contributors, and a shared machine is one. Neither is wrong, and nothing yet asks
  the question sharply enough to settle it.
- Coin per mob pools with peers; an item's vendor price does not
  ([ADR 0047](./0047-money-is-copper-in-two-ledgers.md)). A price is the easiest thing of all to
  pool — it's the same for everyone, so one observation settles it — but it isn't in the
  observation payload. Worth adding, or is "what you've sold yourself" the honest scope?
- Undocumented drops are surfaced per mob. Should they also be *reported upward* somewhere —
  a shared list of "things this build drops that no wiki knows"? The room already pools
  observations ([ADR 0024](./0024-mob-knowledge.md)); this would be the useful summary of them.
- Should out-of-era pages be *hidden* (not just badged)? Filtering search results by
  era would need a category lookup per result — flagging-on-open is done today.
- Should the overlay support multiple named lists / profiles per character?
- Should the damage meter break a fight down by *phase* (adds arriving, mob enraging)?
  Today a fight is one flat window from first swing to last.
- Should the overlay toggle hotkey be user-configurable? (Currently a fixed
  `Ctrl/Cmd+Shift+O` via Electron's built-in `globalShortcut` — no native dep.)
