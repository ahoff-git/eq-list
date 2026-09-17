# 0259: A stored quest guess can be rechecked in place

## Status

Accepted

## Context

[ADR 0257](./0257-a-guessed-giver-must-be-a-mob-to-name-a-quest.md) stopped a *live* dialogue-guessed
faction cause from naming a quest whose "Quest giver" isn't actually a mob. The user's next question
was the obvious one: what about the hits already sitting in `faction_hits` with the wrong guess baked
in? "Can we fix our data?"

Two things rule out the ledger's existing repair path (`FactionLog`'s `faction-log` provenance
concern, `remedy: "re-eat"`, `unattended: true`) as the answer:

- **A digested log can't overwrite a hit's guess anyway.** `factionKey` deliberately excludes
  `causedBy` from a hit's identity (`faction-log.ts`'s own header: "it's a guess about the same line,
  not part of what the line *is*"), and `insertHit` is `INSERT OR IGNORE` — a key already present is
  skipped outright, `causedBy` included. Re-eating a log has never rewritten an existing hit's guess,
  only added hits that weren't recorded before.
- **Even if it did, `log-import.ts` doesn't wire `questGiver`/`questDialogue` at all** (ADR 0221's own
  deferral) — a fresh re-derivation on that path would lose every quest name outright, mob-given or
  not, rather than keep the correct ones and drop only the wrong ones.

But the fix this genuinely needs is smaller than a log re-read. A dialogue-caused hit already stores
exactly the two things `questsForSpeaker` needs — the guessed `npc` and the quoted `text` — and ADR
0257's whole point was that the answer depends only on **today's wiki cache**, not on anything the raw
log line itself has to say twice. Re-deriving `quests`/`questsMatched` for a hit already on record
costs one lookup per stored dialogue hit against data the app already keeps warm; it needs no re-read,
no ambiguity, and no choice for a person to make — the exact test
[ADR 0096](./0096-stored-data-says-which-rules-wrote-it.md) draws between a **schema** ("the app can
repair by itself, at launch, silently") and a **revision** ("the app cannot fix on its own... so the
honest thing is to say so and let a person decide"). This is the former, even though it isn't a pure
schema migration: no new `DataConcern`/remedy vocabulary is invented for a single, self-contained
backfill nothing else will reuse.

## Decision

- **`src/shared/faction-cause.ts`** exports `questsForSpeaker(npc, text, deps)`, pulled out of
  `guess()`'s dialogue branch rather than duplicated — a re-check has to produce *exactly* what a live
  guess would say for the same inputs, not a second implementation that could quietly drift from it.
- **`electron/faction-log.ts`**: `FactionLog` gains `recheckDialogueQuests(deps)`. It selects every
  `caused_by_kind = 'dialogue'` row, re-derives `quests`/`questsMatched` via `questsForSpeaker` against
  the caller's current wiki lookups, and writes back only the rows whose fresh answer differs from
  what's stored — returning `{ checked, changed }` for a log line, not a UI. Idempotent by
  construction: a row already agreeing with today's cache costs a comparison and nothing else.
- **`main.ts`** calls it once per launch, chained onto the existing background catalogue warm-up
  (`wiki.catalogueJson()`, `CATALOGUE_WARM_MS` after the window paints) rather than a separate timer —
  it needs that same walk to have populated `levelSources().mob`/`questGiverSource`/
  `questDialogueSource` first, or a cold cache would read every giver as unconfirmed and strip
  everything. Silent unless something actually changed, then one `log.debug` line.
- **Not a `DataConcern`.** The `faction-log` concern's existing `remedy: "re-eat"` is left alone —
  it's still the right answer for a hit that's missing outright (evicted before ADR 0232 removed the
  cap). This repair runs unconditionally, every launch, rather than behind a revision bump: it isn't
  gated on a rule having changed *since a stamp was written*, it re-derives from whatever the wiki
  cache says *right now*, which is exactly why it stays useful indefinitely rather than being a
  one-time migration — a giver the cache hadn't confirmed yet last launch can gain its quest back the
  next time this runs, the same way it could have going forward if the hit had never happened before.

## Consequences

- A faction hit already on disk that named a quest through a non-mob "Quest giver" loses that
  annotation the first time this runs after the fix ships, with no log re-read and no lost hits.
- A hit that had *no* quest annotation purely because the giver's page (or a quest it gives) wasn't
  cached yet at the time can gain one later, the moment the wiki cache catches up — a small, welcome
  side effect of re-deriving rather than only ever narrowing.
- This runs on every launch, forever, not once. The cost is one `SELECT` over dialogue-caused hits
  (a small fraction of the ledger) plus a lookup per row; nothing here bounds how large that fraction
  can grow, which is worth revisiting only if a very long-lived ledger ever makes it worth measuring.
- Same limits as the live guess it mirrors: coverage is still whatever the wiki cache happens to hold
  (ADR 0221/0223's "best effort, no proactive crawl"), and the "can't tell an NPC from a nearby player"
  gap (ADR 0220) isn't touched by this at all — this only ever recomputes which *quest* a
  already-recorded dialogue guess names, never whether the dialogue guess itself was the right speaker.
