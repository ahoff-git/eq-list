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

## Open Questions
- Should out-of-era pages be *hidden* (not just badged)? Filtering search results by
  era would need a category lookup per result — flagging-on-open is done today.
- Should the overlay support multiple named lists / profiles per character?
- Should the overlay toggle hotkey be user-configurable? (Currently a fixed
  `Ctrl/Cmd+Shift+O` via Electron's built-in `globalShortcut` — no native dep.)
