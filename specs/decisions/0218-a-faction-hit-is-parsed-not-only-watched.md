# 0218: A faction hit is parsed, not only watched

## Status

Accepted

## Context

ADR 0193 shipped the alerting half of faction tracking — a raw-line `CastWatch` a faction page's
"🔔 Alert me" button adds — ahead of a verified line, and named the two things it deliberately left
undone: a structured `parseFactionChange` → `FactionEvent {faction, delta, direction}` in
`log-parser.ts`, and a pooled `FactionObservation` store mirroring `mob-knowledge.ts`/
`contributions.ts` so a tracked faction-mob's kill or a tracked quest's turn-in could credit an
observed delta. Both were blocked on the same thing every parser in this app is held to: a real
captured line, not a guessed one (`specs/log-watching/README.md`'s non-responsibilities list named
this the one deliberately deferred gap).

The line has since turned up, second-hand, while researching achievement content (ADR 0214): a real
52,000-line log contains `"Your faction standing with Agents of Mistmoore has been adjusted by -3."`
and the floor case, `"Your faction standing with Agents of Mistmoore could not possibly get any
worse."` — confirming `buildFactionWatch`'s "faction standing" bet was already right, and giving the
sentence shape (`with <faction> has been adjusted by <±N>`) a parser needs. The ceiling case
("...could not possibly get any better.") was already known independently — it's the exact sentence
`achievement-library.ts`'s Ally criteria match as a substring — so all three wordings a faction line
takes are now accounted for.

Separately, the user asked for faction tracking built the same way loot tracking works: a running
record of what raised or lowered a faction, and a rate the way money tracking has one. That request
is answered entirely by the parser + a personal ledger — it says nothing about pooling with peers or
correlating a hit to the mob or quest that produced it.

## Decision

Build the parser and a personal ledger; leave the pooled/correlated half for later, as its own
follow-up rather than guessed at now.

- **Parser**: `parseFactionChange` in `log-parser.ts`, alongside the other line matchers, added to
  `parse-line.ts`'s `MATCHERS` late (it's a handful of lines a night, same tier as `parseGameTime`/
  `parseSighting`). Produces a `FactionEvent {faction, delta, direction}` — `delta` is `null` for the
  floor/ceiling wordings, which state no number, and `direction` is `"raised"`/`"lowered"` for a
  stated amount or `"floor"`/`"ceiling"` for the two capped wordings. Unlike `LootEvent`, it carries no
  zone: a standing is a fact about your character, not about where you were standing when the game
  told you about it, so ADR 0136's "logged data says where it happened" rule has nothing to attach to
  here.
- **Ledger**: `electron/faction-log.ts`, structured exactly like `loot-log.ts` — an always-on feed,
  keyed by its log line (ADR 0033), persisted and capped, fed by the watcher's own `onFaction` channel
  and by `log-import.ts`'s digest path, so eating a past log fills it too. `standings()` folds the feed
  to one row per faction (`net`, `raises`, `lowers`, `floors`, `ceilings`, `firstAt`, `lastAt`); a hit
  aging out of the capped feed is folded into a `retired` standing first, the same rule that keeps a
  loot price alive past its drop (ADR 0056) — a faction's net must never shrink just because the feed
  filled up.
- **Rate, not stored**: the Faction tab computes net-per-hour at render time from `net`/`firstAt`/
  `lastAt` via `ratio()`, the same way `SessionPanel` turns raw coin into copper/hour (ADR 0047) rather
  than storing a rate that could drift from the totals behind it.
- **Wiring**: `evt:faction` / `faction:recent` / `faction:standings` follow the loot channels' naming
  exactly; `faction-log` is a registered `DataConcern` (`re-eat`, `unattended: true` — placing a hit
  needs no judgement, same as a loot line) so a future parser fix can re-derive it unattended; the
  bulk "forget recorded data" action clears it alongside kills and loot.
- **UI**: `FactionPanel.tsx`, a Hits/Standings segmented view mirroring `LootPanel`'s Drops/Sells for
  split, with a faction name as an `ItemLink` into its existing wiki page (raise/lower quests and
  mobs, ADR 0192).
- **Not built here**: the pooled `FactionObservation` store and the kill/turn-in → faction-delta
  correlator ADR 0193 named. Crediting a delta to *what caused it* needs a new correlator (no existing
  pipeline credits a `kind: "mob"` shopping-list entry — `store.applyLoot` explicitly excludes them),
  and pooling it needs the same five contribution rules `mob-knowledge.ts` already has. Both are real
  future work, tracked in `specs/todo.md`, and deliberately left there rather than built speculatively
  alongside the half that was actually asked for.
- `faction-watch.ts`'s `TRIGGER` is left as `"faction standing"` — now confirmed rather than guessed —
  and the raw-line watch is left in place rather than rebuilt on the structured event: it's a banner,
  and the ledger already gives a faction page everything a wired-up condition would.

## Consequences

- The app now has real, observed evidence of what raised or lowered a faction from your own play,
  independent of (and able to disagree with) whatever a wiki faction page's raise/lower lists say —
  the same "observation over the wiki" shape mob knowledge already has (ADR 0025), just not pooled yet.
- A faction's net standing is durable: it survives the feed's cap and a "forget recorded data" reset
  the same way a loot price does, and only the explicit `"everything"` scope removes it.
- The rate shown is a **since-first-seen** average, not a session figure — there is no natural
  "session" for a faction the way `SessionPanel`'s coin/hour has one, so it reads as "how fast has this
  been moving overall" rather than "how fast tonight".
- Nothing here credits a faction hit to the mob killed or the quest turned in a moment before it — that
  remains a real gap, and the todo item for it now names this ADR's ledger as what it would build on
  top of, rather than describing a parser that doesn't exist yet.
