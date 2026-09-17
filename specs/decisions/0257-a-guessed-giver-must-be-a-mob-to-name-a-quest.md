# 0257: A guessed giver must be a mob to name a quest

## Status

Accepted

## Context

[ADR 0221](./0221-a-guessed-speaker-can-name-a-quest-giver.md) let a dialogue-guessed faction cause
name the quest(s) its speaker is a cached "Quest giver" for, and flagged its own gap plainly in its
Consequences: *"If a giver's name ever collides between two different things ... nothing here
disambiguates — `questGivers` is keyed purely by string."*

The user caught the sharper version of that gap: **every** quest-conversation attribution built this
way is suspect, not just a name-collision edge case. `Quest giver` is a bare wiki table cell — most
of the time an NPC, but sometimes an item, a book, or some other non-mob source a quest starts from.
The dialogue signal this whole guess is keyed on ("`Name` tells you, '...'" / "`Name` says, '...'",
`DIALOGUE_RE`) is a **mob talking** — that is the only way EQ ever writes a conversation to the log.
A "Quest giver" cell that names something else could never have produced the line the guess is
matching against, so trusting it is not a narrower guess, it's a wrong one: unless the wiki confirms
the named giver is an actual mob, a conversation cannot be its quest's cause.

The data to check this already exists and is already trusted for the same purpose elsewhere: the
Items tab's level placement (`electron/wiki/index.ts`'s `buildCatalogue`, ADR 0163) already builds
`mobLevels`, a folded-name map of every NPC the cache has confirmed is a mob — from the mob's own
wiki page, or from a zone page's NPC roster — and exposes it as `WikiClient.levelSources().mob(name)`.
No second registry is needed; the same lookup that already tells an item "your level comes from the
mob that drops you" can just as well tell the faction guess "this name is a mob, not a book."

## Decision

- **`src/shared/faction-cause.ts`**: `FactionCauseTrackerDeps` gains a third optional lookup,
  `isMob?: (npc: string) => boolean`, alongside `questGiver`/`questDialogue`. Inside `guess()`, the
  dialogue branch only calls `deps.questGiver` when `deps.isMob` (if given) says the speaker is a
  mob — an unconfirmed giver names no quest at all, the same "absent, not an empty list" shape
  `FactionCause.quests` already uses for a giver the lookup doesn't recognize. Left unset, `isMob`
  defaults to trusting every candidate, so the module reads exactly as it did before this ADR — an
  optional, best-effort dependency in the same shape as its two siblings, not a required one.
- **`main.ts`** wires it as `isMob: (npc) => !!wiki.levelSources().mob(npc)` — reusing the existing
  ADR 0163 mob-level lookup rather than adding a new one, asked fresh each time like the other two
  wiki lookups already are.
- **Not wired into `log-import.ts`**: that path doesn't pass `questGiver`/`questDialogue` either
  (ADR 0221's own deferral), so there is nothing for `isMob` to gate there yet.
- **Left alone on purpose**: `electron/wiki/index.ts`'s `questGivers` map itself is unchanged — it
  still records every "Quest giver" cell verbatim, mob or not. The check belongs at the point a
  *conversation* is being blamed for a quest, not at the point the wiki fact is cached, since the same
  cell may be read for other reasons (a quest's info card, say) where "is this a mob" was never the
  question.

## Consequences

- A conversation-guessed faction cause no longer names a quest whose own "Quest giver" cell is
  something the game could never have spoken through — the specific failure mode the user flagged.
- Coverage is bounded by the same cache `mobLevels` already depends on: a real mob whose own page
  hasn't been fetched and whose zone roster lists it with no parseable level reads as "not a
  confirmed mob" and loses its quest annotation too, a false negative rather than a false positive.
  That is the same "best effort against what's cached, never a proactive crawl" tradeoff ADR
  0221/0223 already made for `questGiver`/`questDialogue` themselves, applied once more rather than
  invented fresh.
- The name-collision gap ADR 0221 flagged (an NPC and an unrelated mob sharing a name) is unchanged
  where the *speaker itself* really is some mob — this only rules out givers that are never a mob at
  all, not two different mobs sharing a name.
