# 0282: An unmatched dialogue line is kept to retry

## Status

Accepted

## Context

[ADR 0281](./0281-three-seconds-and-point-five-were-already-right.md) measured a real player's full
`eqlist.db` and found that **not one of their 20,571 faction hits has ever been recorded with
`caused_by_kind = 'dialogue'`** — not because the kill window or the dialogue match threshold were
miscalibrated (both measured out as already sound), but because of how `recheckDialogueCauses`
(`electron/faction-log.ts`, built by [ADR 0259](./0259-a-stored-quest-guess-can-be-rechecked-in-place.md)/
[ADR 0261](./0261-an-unmatched-speaker-is-no-cause-at-all.md)) is scoped: its query is
`WHERE caused_by_kind = 'dialogue'` — it only ever **revisits a hit that already carries a dialogue
guess**, to correct or withdraw it as the wiki's quest-giver cache changes. It has no way to **promote**
a `null` hit, because `guess()` (`src/shared/faction-cause.ts`) simply returns `undefined` when
`questsForSpeaker` finds no match, and the npc/text it looked at is discarded — the stored
`FactionRecord` ends up with `caused_by_kind = NULL` and nothing else.

Of the 417 hits (3.7%) no kill explained within `CORRELATION_WINDOW_SEC`, ADR 0281's survey found:

- **185 (44%)** have a dialogue line nearby *and* a quest-giver/dialogue the wiki cache holds **today**
  — turn-ins this app's own cache has grown enough to explain, sitting uncaused purely because nothing
  survived long enough to be rechecked.
- **39 (9%)** have a dialogue line nearby but name a giver the cache has never fetched at all (ADR
  0221/0223's already-known "coverage depends on what's cached" limit).
- **193 (46%)** have nothing nearby at all — no kill, no dialogue, within either window. This is the
  real floor of what proximity-based guessing can ever explain for this log, untouched by this decision.

Closing the 185+39 gap needs two things: `guess()` carrying the unmatched npc/text forward even when it
returns no `FactionCause`, and somewhere in `faction_hits` to hold "a line was said nearby, but nothing
matched it" for a row whose `caused_by_kind` is `NULL`. ADR 0281 deliberately left this unbuilt and
flagged the real open question: **scope**. [ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)
made every ledger on this database answer "forever" to "how much do you hold" — but that ADR is about
not *evicting* a hit once it's recorded, not about what else that hit's own row carries forever. Storing
an extra payload on **every** hit that ever resolves to no cause — including the 193 with nothing
nearby at all — would be a different, broader kind of "forever" than ADR 0232 ever asked for.

## Decision

- **Scope: only a hit that actually saw a dialogue line in window gets the extra payload — nothing is
  stored for a hit with no kill and no dialogue nearby at all.** This isn't a new cap or expiry
  mechanism; it's the same gate `guess()`'s dialogue branch already evaluates (`DIALOGUE_WINDOW_SEC`)
  to decide whether to call `questsForSpeaker` in the first place. It naturally limits the feature to
  the real population ADR 0281 measured — 224 of 20,571 hits (the 185+39), not all 417 null hits and
  certainly not all 20,571. No age limit on top of that: once a hit is one of the 224, its unmatched
  context is kept exactly as long as the hit itself is (ADR 0232's existing, already-accepted
  "forever" for this same table) — consistent with `recheckDialogueCauses` itself already running
  "every launch, forever, not once" per ADR 0259, and with the storage cost being genuinely small
  (two short strings and a float, on ~1% of hits). A narrower, time-boxed retry window was considered
  and rejected: it would add a second bounding concept to a ledger that already has none, to save
  bytes nobody measured as a real cost, at the price of permanently giving up on the 39 "not yet
  cached" hits the moment their window lapsed — exactly the outcome ADR 0281 flagged as worth closing.
- **`src/shared/faction-cause.ts`**: `guess()` (private to `createFactionCauseTracker`) now returns
  `{ cause?: FactionCause; unmatchedDialogue?: { npc; text; gapSec } }` instead of a bare
  `FactionCause | undefined`. `unmatchedDialogue` is set only in the one branch where a dialogue line
  was in window and `questsForSpeaker` found nothing — never when there was no dialogue nearby, and
  never alongside a `cause` (a kill explaining the hit, or a matched dialogue cause, leaves nothing to
  retry). `resolve()` folds this into the returned `FactionRecord`; `explainUnsourcedCoin` (a debug-log
  line with no ledger row behind it to recheck later) only ever reads `cause`, unchanged.
- **`src/shared/types.ts`**: `FactionRecord` gains `unmatchedDialogue?: { npc: string; text: string;
  gapSec: number }` — documented as only ever present when `causedBy` is absent.
- **`electron/faction-log.ts`**: `faction_hits` gains three nullable columns (migration **version
  10** — the highest claimed anywhere at the time this was written, per-store `version:` grepped fresh
  across every `electron/*.ts` store to confirm, the same discipline `specs/decisions/README.md` asks
  of an ADR number): `unmatched_npc`, `unmatched_text`, `unmatched_gap_sec`. `insertHit`/`paramsOf`/
  `rowToRecord` carry the new field through exactly like any other column. `recheckDialogueCauses`'s
  query widens from `WHERE caused_by_kind = 'dialogue'` to also match
  `caused_by_kind IS NULL AND unmatched_npc IS NOT NULL`, reading `causedByKind` back so the function
  can tell its two cases apart: an already-dialogue-caused row still corrects/withdraws exactly as ADR
  0259/0261 built it; a null-with-unmatched-context row is promoted to a real `dialogue` `causedBy` the
  moment `questsForSpeaker` agrees (reusing the exact function a live guess calls, same as ADR 0259's
  own reasoning), clearing the `unmatched_*` columns in the same statement since there's nothing left
  to retry once a cause exists. A row that still matches nothing is left alone, retried again next
  launch, for as long as the hit itself exists.

## Consequences

- A faction hit that saw an NPC line with nothing to explain it at the time can now gain a real
  `dialogue` cause later, the moment the wiki's quest-giver cache grows enough — closing the gap ADR
  0281 measured as potentially all 185 of one real player's genuine dialogue-caused hits.
- `faction_hits` rows for the ~1% of hits that see dialogue near an otherwise-unexplained hit are
  slightly wider (two short strings, one float); every other hit's row is unchanged. No new cap, no new
  expiry, no new `DataConcern` — this runs the same unconditional, every-launch way
  `recheckDialogueCauses` already did.
- The 39 hits naming a giver the cache has never fetched at all keep their unmatched context
  indefinitely and get retried every launch for as long as they're uncaused — cheap, and exactly the
  behavior that lets them resolve the day their giver's page is finally crawled, with no separate
  mechanism needed.
- The 193 hits with nothing nearby at all are completely unaffected — no new column value, no extra
  work in the widened query (the `unmatched_npc IS NOT NULL` half of its `WHERE` excludes them), and
  they remain the same measured floor ADR 0281 already named.
- A pre-ADR-0282 hit already on disk has no `unmatched_npc` (the column defaults `NULL` from the
  migration) — nothing retroactively recovers a line that was already discarded before this shipped;
  only a hit recorded from here on can carry the context forward.
