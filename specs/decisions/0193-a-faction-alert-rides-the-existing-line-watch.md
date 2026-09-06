# 0193: A faction alert rides the existing line watch

## Status
Accepted

## Context
Following ADR 0192 (faction search and tracking), the user asked for two more things: an optional
alert when a tracked faction's standing changes, and collecting that data over time so the app
learns what actually helps/hurts a faction from the player's own log — the same "observed vs. the
wiki" shape [ADR 0024](./0024-mob-knowledge.md) already gives mob drop rates.

`specs/log-watching/README.md`'s own non-responsibilities section already names "faction hits" as a
deliberately deferred gap: every parser in `log-parser.ts` was built and is documented against a
**real captured line** from a live client, and nobody has yet captured EQL's actual wording for a
faction-standing change. Two real wordings exist as wiki-transcribed quest-walkthrough text
("Your faction standing with Priests of Marr got better.", "...has been adjusted by -20.") — real,
but authored by a wiki editor describing what they saw, not a line pulled from this app's own log
tailer. The user is capturing a real line from their own log to settle this properly.

Separately, `log-watching/README.md` already names a **generic raw-line watch** (ADR 0050) as the
mechanism built for exactly this kind of message — ADR 0050 itself names "a faction hit" as one of
the examples it was written to eventually cover, alongside a tell and a trade invite. A `CastWatch`
with `onLine: true` matches any substring against whole log lines, needs no parser, and already
ships a "library" of ready-made rules (`src/shared/watch-library.ts`) including ones that
deliberately ask the player to fill in a word rather than guess at unverified wording (`placeholder`,
`named-up`, `zone-scoped`).

## Decision
Ship the **alerting half now**, ahead of the real captured line, since a watch's cost of being wrong
is a missed or extra banner — nothing structural depends on it being exact. `WikiPageView`'s faction
page gets a "🔔 Alert me on standing changes" button (`buildFactionWatch` /
`isFactionWatched`, `src/shared/faction-watch.ts`) that adds a `CastWatch` directly (not through the
generic library, since the faction name is already known in context and needs no fill-in):

```ts
{ spell: "faction standing", onLine: true, onCast: false,
  conditions: [{ field: "line", op: "contains", text: <faction title> }],
  message: `${title} standing changed` }
```

`"faction standing"` is chosen as the trigger because it is the near-universal EQ system-message
opener across both known real wordings, not because it has been verified against this app's own log
— the code comment says so plainly, and it should be corrected (or replaced by a real `FactionEvent`
condition) the moment a verified line is in hand.

**Deferred, pending the real line** (tracked in `specs/todo.md`): a structured `parseFactionChange` →
`FactionEvent` in `log-parser.ts`, and a pooled `FactionObservation` store mirroring
`mob-knowledge.ts`/`contributions.ts` exactly (own `sanitize`/merge functions, same five rules —
keyed by contributor id, a report replaces that contributor's whole set, untrusted on arrival,
bounded per peer) so that killing a tracked faction-mob or turning in a tracked quest can credit an
observed delta. This has no existing pipeline to mirror on the shopping-list side —
`store.applyLoot` explicitly excludes `kind: "mob"` entries by design — so the correlator has to be
new, modeled on the kill-log → mob-knowledge derivation rather than on loot crediting.

## Consequences
- The alert can go live today, with no dependency on the parser work.
- `"faction standing"` could, in principle, miss if EQL's real wording differs more than expected, or
  (much less likely) collide with unrelated chat containing both that phrase and the faction's own
  name — both failure modes are silent (no banner, or a rare extra one), never a wrong parse or a bad
  shopping-list entry, which is what makes shipping ahead of verification acceptable here and would
  not be acceptable for a structured event.
- The heavier half — real per-mob/quest faction-delta collection, pooled with peers — stays blocked
  until a real line is captured, same as ADR 0121's consider-level gap, and for the same reason: the
  regard-wording list that would gate it fails closed on purpose, so guessing the wording is exactly
  the mistake that discipline exists to prevent.
