# 0261: An unmatched speaker is no cause at all

## Status

Accepted

## Context

[ADR 0257](./0257-a-guessed-giver-must-be-a-mob-to-name-a-quest.md) stopped a dialogue-guessed faction
cause from naming a quest whose "Quest giver" isn't a mob, and [ADR 0259](./0259-a-stored-quest-guess-can-be-rechecked-in-place.md)
taught the ledger to correct hits already on disk. The user checked the result against a real
character and found it didn't go nearly far enough: their **Clan Runnyeye** standing still showed 25
"conversation"/Quest-sourced causes, and every single one of them was an ordinary camp mob — "A
Pickclaw mindripper," "A goblin lookout," several of their own `'s corpse` — never a quest giver at
all, wiki-confirmed mob or not.

The real explanation was hiding in this app's own code. `unmatched-lines.ts`'s `IGNORED` list already
treats a bare `(?:\w+) says,` as ordinary noise elsewhere in this app, in its own words "noise by the
thousand" — because that is exactly the shape EQ uses for a hostile mob's own combat social (a
call-for-help, an aggro taunt) and even a fresh corpse's own flavor line, not only for a friendly
quest-giver's reply. `DIALOGUE_RE` cannot tell these apart from a genuine turn-in line — nothing about
the *text's shape* says which it is. ADR 0220 already knew the dialogue signal was imperfect
("nothing here can tell an NPC's reply from a nearby player's `says`"), but sized that risk as a rare,
compounding coincidence — a hit with no kill nearby, *and* unrelated chat landing in the narrow window,
*and* nothing else said in it. A hostile mob's own social line is not that rare: it is routine, for any
camp whose mobs talk at all, and it fires **during the exact fight** that's about to produce the
faction hit — the opposite of "unrelated."

Once the giver's own quest-giver status is checked at all (ADR 0257's `isMob`/`questGiver` cross-
reference), the fix falls out for free: a camp mob genuinely is never a "Quest giver" for anything in
the wiki, so a speaker `questsForSpeaker` can't match to any quest is, in practice, exactly the
population this bug produced. The question is what to do with that non-match — ADR 0220/0221 chose to
still show the NPC and quoted text as unmatched-but-plausible evidence, on the theory that a real quest
giver whose page just hadn't been cached yet deserved *something* on screen. Real data says that
theory cost more than it paid for: the 25 false Runnyeye rows outnumber, by a wide margin, the
legitimate "not yet cached" case it was protecting.

## Decision

- **`src/shared/faction-cause.ts`**: `questsForSpeaker` returns `undefined` — not `{}` — when nothing
  matches a quest, whether because the giver isn't a mob (ADR 0257) or because it simply isn't a
  "Quest giver" for anything at all. `guess()`'s dialogue branch only returns a `kind: "dialogue"`
  `FactionCause` when `questsForSpeaker` found something; otherwise the hit is left uncorrelated, the
  same as if `noteLine` had never matched anything. `FactionCause`'s `dialogue` variant is untouched as
  a type — `quests`/`questsMatched` stay optional in the schema — but in practice a *fresh* guess can
  no longer produce one without them.
- **`electron/faction-log.ts`**: `recheckDialogueQuests` is renamed `recheckDialogueCauses` and
  broadened — when `questsForSpeaker` now returns `undefined` for an already-stored dialogue hit, the
  **whole** `causedBy` is cleared (`caused_by_kind` and everything alongside it set to `NULL`), not
  just its quest fields, reverting the hit to uncorrelated exactly as ADR 0259's mechanism already does
  for the narrower ADR 0257 case.
- **`main.ts`**'s existing post-launch call (ADR 0259) is unchanged in shape, just renamed, and now
  fixes both classes of bad guess on the same pass.
- **Not solved by tightening `DIALOGUE_RE` or the two time windows.** Neither the regex nor
  `CORRELATION_WINDOW_SEC`/`DIALOGUE_WINDOW_SEC` can tell a quest-giver's reply from a mob's own social
  by shape or timing — both are logged identically, often within seconds of the same fight. Requiring
  an actual matched quest is a **structural** fix (only a real, wiki-known quest giver can ever be the
  cause), not a tuning one.

## Consequences

- A camp of ordinary mobs no longer accumulates "conversation" rows on a faction standing just because
  they talk during combat — the exact, confirmed shape of the user's report.
- The trade-off ADR 0220/0221 accepted is reversed: an NPC who really is an uncached quest giver, with
  their page never fetched, now shows **no cause at all** rather than raw, unmatched evidence. Given
  what real data just showed about how often "unmatched" meant "not a quest giver, don't trust this
  either," this is judged the safer default — silence over a routinely-wrong guess.
- Every `FactionCause` of `kind: "dialogue"` a *live* guess produces from here on is guaranteed to
  carry a matched `quests`/`questsMatched` pair; only pre-ADR-0261 data on disk can still show one
  without, and `recheckDialogueCauses` clears those the next time it runs (ADR 0259's own mechanism, no
  changes needed there beyond the rename).
- `explainUnsourcedCoin`'s debug-only "unattributed coin, possible cause" log line inherits the same
  fix for free, since it shares `guess()` — fewer debug entries blaming an unrelated mob's social line
  for a loose coin pickup.
