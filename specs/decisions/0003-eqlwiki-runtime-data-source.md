# 0003: eqlwiki.com as a runtime, cached data source

## Status
Accepted

## Context
The app previously pulled from a now-defunct resource. EQL is a different game and
its data lives at eqlwiki.com, a MediaWiki site with an `api.php` endpoint. The
`eql-buff-calc` sample scrapes this wiki at **build time** into committed JSON,
because it deploys as a static web page with no backend.

EQ List is different: it has a live backend (the Electron main process) and needs
arbitrary pages on demand (whatever item/quest/recipe the user searches), not a
fixed pre-baked set.

## Decision
Fetch from eqlwiki **at runtime** through the main process and cache parsed pages
as JSON under `userData/wiki-cache` (7-day TTL, stale-on-error fallback). Use
`opensearch` for autocomplete and `action=parse&prop=text` for page HTML. Parsing
is a pure function (`electron/wiki/parse.ts`) tuned to the real wiki DOM.

## Consequences
- Any page is reachable without a rebuild; results are cached for speed and offline.
- Reuses the sample's proven approach (MediaWiki API + `node-html-parser`) without
  its build-time generation step.
- The parser is coupled to eqlwiki's HTML; wiki markup changes can break extraction,
  so parsing is isolated and testable on fixtures.
- The sample's out-of-era filtering is **not** ported yet (see [todo](../todo.md)).
