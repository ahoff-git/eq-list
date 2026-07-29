# Decisions

Architecture Decision Records in the Michael Nygard format. Numbers are
sequential and immutable; supersede rather than edit an `Accepted` decision.

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

## Open Questions
- Should out-of-era pages be *hidden* (not just badged)? Filtering search results by
  era would need a category lookup per result — flagging-on-open is done today.
- Should the overlay support multiple named lists / profiles per character?
- Should the damage meter break a fight down by *phase* (adds arriving, mob enraging)?
  Today a fight is one flat window from first swing to last.
- `session-stats.ts` and `combat-stats.ts` both consume kill/XP events now (different
  aggregations: session counters vs fight-scoped rates). Should the Session tab's counters
  come from the combat tracker so there's one consumer?
  See [ADR 0017](./0017-camp-efficiency-and-asking-the-player.md).
- The pet's *own* death parses as a kill (`<pet> has been slain by …`); the combat tracker
  filters it, but `session-stats.ts` still counts it in the Session tab's kill total.
- Should the overlay toggle hotkey be user-configurable? (Currently a fixed
  `Ctrl/Cmd+Shift+O` via Electron's built-in `globalShortcut` — no native dep.)
