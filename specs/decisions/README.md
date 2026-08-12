# Decisions

Architecture Decision Records in the Michael Nygard format. Numbers are
sequential and immutable; supersede rather than edit an `Accepted` decision.

0049 is deliberately absent: it recorded a pathfinding experiment on the map's
geometry that was removed rather than kept, and the record went with it. The
number is retired, not free. It stays retired: [0062](./0062-a-travel-graph-of-zone-lines.md)
routes between zones over the mapmakers' **exit labels**, which is different data
with a different provenance, and still does no routing inside one.

## Log
- [0001: Record architecture decisions as ADRs](./0001-record-architecture-decisions.md)
- [0002: Electron desktop shell over the existing Next.js app](./0002-electron-shell-over-nextjs.md)
- [0003: eqlwiki.com as a runtime, cached data source](./0003-eqlwiki-runtime-data-source.md)
- [0004: Poll-and-tail log watching with a pure parser](./0004-log-watching-strategy.md)
- [0005: Static-export renderer served over an app:// protocol](./0005-renderer-static-export-and-app-protocol.md)
- [0006: Fuzzy search over a cached title index](./0006-fuzzy-search-with-title-index.md)
- [0007: Quests-by-zone via backlinks ∩ Category:Quests](./0007-quests-by-zone-via-backlinks.md)
- [0008: In-app page navigation with a history stack](./0008-in-app-page-navigation.md)
- [0009: One translucent window + a system tray](./0009-single-window-with-tray.md)
- [0010: Port eq-map's map core; show the map in a sibling window](./0010-ported-map-core.md)
- [0011: Opt-in peer location sharing over awari](./0011-awari-peer-location-sharing.md) — *superseded by 0012*
- [0012: awari connection owned by the main window, brokered over IPC](./0012-awari-connection-owned-by-main-window.md)
- [0013: CI publishes a rolling "latest" Windows build](./0013-ci-rolling-latest-windows-build.md)
- [0014: Damage meter parsed from the log, with log-time fights](./0014-damage-meter-from-the-log.md)
- [0015: Peer presence from awari's roster, names from a `hello` payload](./0015-peer-presence-via-hello.md)
- [0016: Combat history on disk, and spell efficiency derived from the log](./0016-combat-history-and-spell-analytics.md)
- [0017: Camp-efficiency analytics, and asking the player for what the log can't say](./0017-camp-efficiency-and-asking-the-player.md)
- [0018: Maximum hit points inferred from the log, stored softly](./0018-inferred-max-hit-points.md)
- [0019: Parse each log line once, and let one tracker own the session](./0019-parse-once-and-one-tracker.md)
- [0020: Split every tally by stance and invocation](./0020-split-by-stance-and-invocation.md)
- [0021: Stored fights keep a pointer back to their source lines](./0021-stored-fights-keep-their-source.md)
- [0022: Invocation side-effects, and placing kills honestly](./0022-invocation-effects-and-kill-locations.md)
- [0023: The kill heatmap — show the doubt, share the conclusion](./0023-kill-heatmap.md)
- [0024: Mob knowledge — observed drop rates and roam areas, pooled with peers](./0024-mob-knowledge.md)
- [0025: Observation outranks the wiki, and disagreements are shown](./0025-observation-over-the-wiki.md)
- [0026: The interface scale only shrinks, and it zooms the window rather than the font](./0026-interface-scale-only-shrinks.md)
- [0027: Only your own kills count, and the log has to say whose they were](./0027-only-your-kills-count.md)
- [0028: Peer networking, actually run — and the five things that were broken](./0028-peer-networking-verified-and-repaired.md)
- [0029: Three measurements corrected by replaying the whole log](./0029-measurements-corrected-against-the-log.md)
- [0030: A log line that already happened is history, not news](./0030-history-is-not-news.md)
- [0031: An inferred bound has to be able to come back down](./0031-an-inferred-bound-must-be-able-to-fall.md)
- [0032: Remove the retained-but-dead overlay/click-through surface](./0032-remove-dead-overlay-surface.md) — *reverses the `clickThrough` retention noted in 0009*
- [0033: Eating a log is idempotent — every kill and drop is keyed by its line](./0033-eating-a-log-is-idempotent.md)
- [0034: Tell the user a newer build exists; don't install it for them](./0034-update-notification.md) — *superseded by [0064](./0064-every-build-has-a-number.md); notify-with-a-link stands, the commit-as-identity half does not*
- [0035: Cast alerts get their own click-through overlay window, over the game](./0035-cast-alert-overlay-window.md)
- [0036: A fight ends on a death, not on a lull](./0036-a-fight-ends-on-death-not-a-lull.md)
- [0037: A zone is one place; its layers are a user choice, not a log fact](./0037-one-zone-many-layers.md) — *its per-image layers retired by 0042; floors continue in 0040*
- [0038: A map has a scale and a centre, and you calibrate it by clicking](./0038-a-map-has-a-scale-and-a-centre.md) — *replaces the `size`/`centerOffset` pair from 0010; **superseded by 0042**, which removes the images and the calibration tool*
- [0039: Render the game's own map files, and let the player choose whose maps](./0039-render-the-game-s-own-maps.md)
- [0040: Floors come from the mapmaker's labels, not from the geometry](./0040-floors-come-from-the-mapmaker.md) — *extends 0037's layer picker to vector maps*
- [0041: The interface scale is a CSS zoom per window, not Chromium's](./0041-interface-scale-is-a-css-zoom-per-window.md) — *re-implements 0026; Chromium's zoom is per-origin*
- [0042: Only the game's own maps — the bundled scans are gone](./0042-only-the-game-s-own-maps.md) — *supersedes 0038 and retires 0010's image core*
- [0043: Where you are is state, not news — recover it, replay nothing](./0043-state-is-not-news-either.md) — *qualifies 0030: the zone and the last `/loc` describe the present, so a mid-session start recovers them*
- [0044: The read position outlives the app — a gap is news, not history](./0044-the-log-position-outlives-the-app.md) — *reverses 0030's in-memory offsets and its "skipped, not queued" caveat; the app's state stops depending on when it was launched*
- [0045: Place a custom alert spot by lending the overlay a click](./0045-place-a-custom-alert-spot.md) — *builds on 0035; the click-through overlay turns interactive for one placing click*
- [0046: We name our own ICE servers, because PeerJS's defaults are not ours to trust](./0046-our-own-ice-servers-not-peerjs-defaults.md) — *the connectivity layer under 0008's transport and 0028's fixes*
- [0047: Money is copper, counted in two ledgers](./0047-money-is-copper-in-two-ledgers.md) — *the money half of 0017's camp question; coin per mob pools like 0024's drop rates, item prices derive from the loot ledger*
- [0048: A map label is read by its words, and a bracket it can't read defers](./0048-a-map-label-is-read-by-its-words.md) — *re-tallies the label kinds 0039 put on screen; multi-select floors and a height window over 0040's storeys*
- [0050: A watch can read a whole log line, not just a spell](./0050-a-watch-can-read-a-whole-log-line.md) — *widens 0035's alert from what the parsers model to anything the game prints (a party invite, a tell), without a new event kind per message*

- [0051: An index is maintained, not re-derived — and a change announces itself](./0051-an-index-is-maintained-and-a-change-announces-itself.md) — *makes 0044's "replay cost is a non-issue" true for a played log and not only a fresh one; keeps 0033's line-keyed idempotence, and gives the map a real change signal instead of a proxy for one*
- [0052: An error goes to the log, not over the game](./0052-an-error-goes-to-the-log-not-the-screen.md) — *0009's always-on-top translucent windows make any full-viewport error UI a blackout of the game; sends errors to the debug file the tray already opens instead*
- [0053: Damage is stored as cells and rolled up, not as a breakdown per combatant](./0053-damage-is-cells-rolled-up.md) — *makes 0014's meter add up: one (victim, attacker, kind, source) cell per hit, read from either end, so the dealt and taken views can't disagree and every share has a stated denominator*
- [0054: A play session is a login, and a fight is named after what we fought](./0054-a-sitting-is-a-login.md) — *takes both from the log instead of the app's lifecycle: 0016's history list was grouping by app run (38 "sessions" for 12 real evenings) and titling fights after whichever group-mate out-damaged you; the label now reads 0053's cells*
- [0055: Eating a log is a catch-up — it fills every bucket it can](./0055-eating-a-log-fills-history.md) — *0033 made eating idempotent for kills and drops; this extends the same keying to fights and loot so an old log backfills 0016's history (by 0054's sittings), the loot feed and 0047's prices, without duplicating an evening you watched live*
- [0056: A dropped record keeps what it taught](./0056-a-dropped-record-keeps-what-it-taught.md) — *0016's "derive, don't duplicate" meant the kill log's and loot ledger's caps silently un-learned 0024's drop rates and roam areas and 0047's prices; eviction — and clearing — now folds a record into a summary first, so only detail is ever lost, and unlearning takes a second, explicit answer*
- [0057: A grade is not an identity, and neither is a difficulty](./0057-a-grade-is-not-an-identity.md) — *an item's `+N` and a zone's difficulty number describe the copy, not the thing, so both fold away wherever a name is matched (the wiki, the map, the list, a drop rate) and stay whole wherever the log is shown; 0025's own headline example turns out to be the wiki's item wearing a `+1`*
- [0058: A ledger needs filters and a column to sort by](./0058-a-ledger-needs-filters-and-a-column-to-sort-by.md) — *the loot tab stacked the ledger over the prices, so once 0033/0055 made the ledger outlive the app the prices sat below hundreds of rows of trash; splits it into two segmented views, adds one filter object and one sort rule (stable, because the log's clock only counts whole seconds) shared with the spell table*

- [0059: A zone's variants are one zone](./0059-a-zone-s-variants-are-one-zone.md) — *0057 folded a zone's difficulty for the wiki and the map lookup but kept the kill log split by it; with real lines (`The Steamfont Mountains 2 (Adaptive)`) that hid an evening's kills from the one map that draws the place and cut every drop sample below 0025's believability bar, so `sameZone` — exact, not `zoneMatches` — now keys kills, per-zone knowledge and observations, retroactively via the key; the one comparison that stays verbatim is which `/loc` fix may place a kill, because changing difficulty is still a teleport*
- [0060: A position belongs to the zone it was taken in](./0060-a-position-belongs-to-the-zone-it-was-taken-in.md) — *0059's teleport rule, applied to the two readers that hadn't heard it: a `/loc` taken before the zone was known was matching every zone (357 kills in a real log placed at another zone's coordinates), and the "You" dot outlived zoning entirely while the trail beside it was already being wiped*
- [0061: A map pack names its own zones](./0061-a-map-pack-names-its-own-zones.md) — *0039 made each folder a source you pick between, but naming pooled every folder's exit labels into one gazetteer; two surveys fighting over `solveZoneNames`' one-name-to-one-file rule cost Brewall eight zone names its own labels state outright and rewrote seven more, so a pack is now named from its own labels and nothing else's*
- [0062: A travel graph of zone lines — route between zones, never inside one](./0062-a-travel-graph-of-zone-lines.md) — *the answer to "how do I get there?" the map deliberately doesn't give ([0049](./README.md), retired: geometry can't say what's walkable). Reads the exit labels 0039/0061 already trust for naming, and 0048 already classifies, into a graph whose nodes are **boundaries** — one node in both its zones, so zoning is free and edgeless, and every edge is a walk across one zone*
- [0063: A zone the pack lacks is borrowed from the game's own maps](./0063-a-zone-the-pack-lacks-is-borrowed.md) — *0061 stopped the packs lending each other names; coverage is the other question, and it went unasked — the game's maps ship no Blackburrow or Unrest and Brewall's ships no New Sebilis Expedition, so whichever folder you picked, hundreds of a real log's kills had no map while the folder beside it had one. A zone is still drawn from one file, named by the folder it came from, and the borrowing is marked in the titlebar*
- [0064: Every build has a number, and "newer" is a comparison](./0064-every-build-has-a-number.md) — *the pipeline never touched the version, so every installer ever built claimed to be `0.1.0` and [0034](./0034-update-notification.md) had to identify builds by commit — which is unique but unordered, so a re-run or a revert would have prompted a "newer" build the user was already past. CI now stamps its run number into the patch (`0.1.<run>`), the release announces it, and the check is `>` rather than `≠`; the silent first-check baseline goes with it, so a stale install is told it's behind*
- [0065: A zone belongs to an expansion, and that's how we know it exists](./0065-a-zone-belongs-to-an-expansion.md) — *a map pack draws all 26 expansions, so the app was offering Argath, Bastion of Illdaera and routing through the Plane of Knowledge. 0062's era flags catch Kunark and Velious because eqlwiki knows those eras; they're blind to everything past them. So the zone → expansion table is **fetched** from the fandom wiki (351 zones, 22 expansions) and one function — `zoneAvailable` — answers it for the map list and the travel graph alike. Fails open, because losing a real zone is far worse than offering an unreachable one*
- [0066: A port is cast from where you stand](./0066-a-port-is-cast-from-where-you-stand.md) — *0062 hubbed the teleport networks with edges **both ways**, which quietly said you travel to a ring the way you board a boat. You don't — a druid casts where they stand — so every route through a port was priced at the cost of walking to the nearest ring, a druid in a ringless zone was told to hike, and a lone ring counted as no network at all. The edges now run one way out of the hub, and the search enters it for free from wherever you are*
- [0067: The damage meter counts your party's fights, not the camp's](./0067-the-meter-counts-your-party-s-fights.md) — *EQ logs every swing in earshot, so at a shared camp the meter was tallying other groups: rows for combatants you never fought, shares taken against their damage, fights opened by their pulls, and their kills in the per-mob table. The unit of filtering is the **fight**, not the combatant — your side (you, pet, group-mates from the log's own group lines, and group chat as membership evidence), plus whatever your side is fighting, admitted whole. It degrades rather than fails when the roster is unknown, since a group is hitting the mob you're hitting; with no character name at all, nothing is filtered*
- [0068: A zone name resolves against what we know](./0068-a-zone-name-resolves-against-what-we-know.md) — *four sources name EQ's zones and no two agree ("Castle Mistmoore" / "Mistmoore Castle" / "The Castle of Mistmoore"), and 16 of the 31 curated zones couldn't be found in the expansion table at all. A **fold** can't fix that — it must be right about names it has never seen, and loosening it would merge East and West Commonlands' kills (0059). So looseness moves to a **resolver** handed the candidate list, which can be loose and still fail closed: four tiers (exact → word order → sub-zone → fuzzy, gated on score **and** margin), with each call site taking only as many as a wrong answer there is cheap. The map takes the strictest, because a wrong file draws the wrong zone under the right name*
- [0069: A succor is a port inside one zone](./0069-a-succor-is-a-port-inside-one-zone.md) — *the walk to the way out dominates a route through a big zone, and EverQuest's answer to it — an evacuation spell, or the `/pick` that lands you at the same spot — moves you **within** the zone you're already in. The maps mark it and the harvest was dropping it, correctly under the old rule (a zone line naming no destination can't be joined to anything) and wrongly for this one marker, which names none because it **has** none. So it's a `place` with a free one-way edge in from every other node in the zone: 0066's "cast from where you stand", one zone wide. No hub, since its network has a single destination; off by default, since nothing on a map says whether you can evacuate*
- [0070: A dropped room re-joins itself](./0070-a-dropped-room-rejoins-itself.md) — *ADR 0028 verified that a room **forms**, never that one **lasts**. awari's `onDisconnected` — the library saying it has exhausted its own leader recovery — had no subscriber, so the first real drop was permanent: every window still reported `connected`, the roster still listed people who couldn't hear us, publishes wrote into a dead session, and the only re-join that existed (the bounded cold-start "lonely" timer) switches itself off the moment a peer is seen. Hence "connections drop all the time and no one sees pings", one symptom rather than two. A drop and a failed join now share an unbounded backoff holding at a minute, opposite to the lonely retries' deliberate three, and teardown uses `leaveRoom` so a departing **leader** hands off instead of making every remaining peer convict it dead first*

## Open Questions
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
- Naming a folder of zones reads every map file inside a synchronous IPC handler, so it blocks
  the main process for up to a second while the map window loads — which now happens at launch,
  beside the replay ([ADR 0051](./0051-an-index-is-maintained-and-a-change-announces-itself.md)).
  Is the answer a cache on disk keyed by the folder, or moving the read off the main thread?
- A line watch is a substring of the whole log line, and nothing rate-limits it
  ([ADR 0050](./0050-a-watch-can-read-a-whole-log-line.md)). A careless one ("hit") fires
  thousands of times a night. Is the overlay's four-banner cap enough, or does a watch want a
  cooldown — and if so, per watch or per matched sentence?
- Open Relay's community TURN is best-effort and not production-grade
  ([ADR 0046](./0046-our-own-ice-servers-not-peerjs-defaults.md)). Is peer sharing worth
  running our own TURN for, or is "works for most, fails for symmetric NAT" acceptable?
- Pooled mob knowledge is attributed and forgettable, but unweighted: every peer counts the
  same. Should contributions be weighted, or individual peers mutable/vetoable?
  See [ADR 0024](./0024-mob-knowledge.md).
- Coin per mob pools with peers; an item's vendor price does not
  ([ADR 0047](./0047-money-is-copper-in-two-ledgers.md)). A price is the easiest thing of all to
  pool — it's the same for everyone, so one observation settles it — but it isn't in the
  observation payload. Worth adding, or is "what you've sold yourself" the honest scope?
- A zone's difficulty rides inside its name, which keeps it out of the stored shapes and the peer
  payload ([ADR 0057](./0057-a-grade-is-not-an-identity.md)). Now that a variant is no longer its
  own sample ([ADR 0059](./0059-a-zone-s-variants-are-one-zone.md)), a camp report that wanted to
  compare difficulties would have to read them off the *records* before they age out. Is that worth
  a field of its own, or is "Blackburrow 3" in the name enough for a player reading their own
  history?
- Undocumented drops are surfaced per mob. Should they also be *reported upward* somewhere —
  a shared list of "things this build drops that no wiki knows"? The room already pools
  observations ([ADR 0024](./0024-mob-knowledge.md)); this would be the useful summary of them.
- Should out-of-era pages be *hidden* (not just badged)? Filtering search results by
  era would need a category lookup per result — flagging-on-open is done today.
- Should the overlay support multiple named lists / profiles per character?
- Should the damage meter break a fight down by *phase* (adds arriving, mob enraging)?
  Today a fight is one flat window from first swing to last.
- Should a fight's stored record keep the raw `logId` range it covered, so a past fight
  could be re-derived from the log if the tracker's maths changes?
  See [ADR 0019](./0019-parse-once-and-one-tracker.md).
- Should the overlay toggle hotkey be user-configurable? (Currently a fixed
  `Ctrl/Cmd+Shift+O` via Electron's built-in `globalShortcut` — no native dep.)
