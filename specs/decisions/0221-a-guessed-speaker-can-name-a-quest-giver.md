# 0221: A guessed speaker can name a quest giver

## Status

Accepted

## Context

[ADR 0220](./0220-a-conversation-can-be-the-guessed-cause-too.md) named the NPC (or, indistinguishably,
nearby player) behind a dialogue-guessed faction cause, but deliberately stopped at the name — it
explicitly declined to match the quoted dialogue against the wiki's own quest text, because a survey of
real eqlwiki quest pages found that text scattered across inconsistent HTML with real transcription
errors, a human editor's prose rather than a verbatim capture of the live log.

The user pushed on this: "at least TRY to match the speaker with the quest giver name... that should
get you 90% of the way there." That's a **narrower and much safer claim** than matching a whole quoted
sentence — a proper noun against a clean, structured table cell, not prose against prose — and it turns
out the data already exists, already parsed, already tested:

- `electron/wiki/parse.ts`'s `parseQuestInfo` reads a quest's `questTopTable` row-by-row and, when a
  row's label contains "quest giver", already writes `{ kind: "quest", where: <name>, detail: "Quest
  giver" }` into that quest's `WikiPage.sources` (`parse.ts:334`) — this predates ADR 0220/0221
  entirely; it was built for the Items tab's own level/zone placement.
- `electron/wiki/index.ts`'s `buildCatalogue()` already walks every cached page once (ADR 0163) and
  already cross-references two other quest facts gathered the same way — a quest's level
  (`questLevels`) and its start zone (`questZones`), each exposed as a plain synchronous function
  (`levelSources()`, `questZoneSource()`) once the walk has run at least once, and warmed
  automatically shortly after app launch (`main.ts`'s existing `wiki.catalogueJson()` warm-up).

So naming a quest from a guessed speaker doesn't need new wiki parsing, a new cache walk, or any new
async wiring into the log-processing path — it needs one more Map built on the walk that already
happens, exposed the same way its two siblings already are.

## Decision

- **`electron/wiki/index.ts`**: `buildCatalogue()` gains a fourth cross-reference, `questGivers: Map<string, string[]>` (giver name, folded to lowercase → every quest title that named them as
  giver — a `string[]` because one giver commonly hands out several quests, and picking just one would
  be a second, unnecessary guess on top of the real one). Exposed as `WikiClient.questGiverSource():
  (npc: string) => string[]`, mirroring `levelSources()`/`questZoneSource()` exactly: a closure
  variable defaulting to `() => []` until the first walk, reassigned at the end of `buildCatalogue()`.
- **`src/shared/faction-cause.ts`** stays pure: `createFactionCauseTracker` takes an optional
  `questGiver?: (npc: string) => string[] | undefined` dependency rather than importing the wiki client
  directly, so the module's own tests inject a fake lookup and never touch a cache. When the dialogue
  guess's remembered speaker matches, every quest they're a known giver of rides along as
  `FactionCause.quests` — plural, and absent (never an empty array) rather than present-but-empty when
  nothing matched.
- **`main.ts`** wires it as `createFactionCauseTracker({ questGiver: (npc) => wiki.questGiverSource()(npc) })` — asked fresh on every guess rather than captured once, since the wiki's own
  cross-reference is rebuilt whenever its cache changes and a snapshot taken at startup would silently
  stop matching anything fetched afterward.
- **Not wired into `log-import.ts`**: the replay path doesn't have `wiki` threaded through it at all
  today, and adding that dependency to `digestLog`/`importLog`/`log-reread.ts`'s `ReReadDeps` for this
  alone wasn't judged worth the surface it would add. A digested log still gets the NPC name; it just
  doesn't get the quest-giver enrichment a live session would. Worth revisiting if `wiki` ever needs
  threading into that path for an unrelated reason.
- **UI**: the Faction tab's Hits table shows the matched quest(s) as a parenthetical beside the NPC's
  name (one plainly, several as "+N more" for room), and the tooltip states outright that a giver
  handing out more than one quest means this never claims to know *which* — only which are possible.

## Consequences

- A faction hit caused by a real quest turn-in now often carries the quest's actual name, at the cost
  of nothing new to verify against a real log: the matching claim is "this NPC is a cached page's
  stated Quest giver", which is either true or it isn't, unlike ADR 0219/0220's timing windows.
- The one thing still riding on ADR 0220's unverified assumptions is *whether the dialogue guess itself
  is even the right speaker* — a coincidental player chat that happens to share a name with a real
  quest giver would name that quest just as confidently as a genuine turn-in would. This ADR doesn't
  change that risk; it only makes a correct guess more informative.
- Coverage depends entirely on what's already cached: a quest whose page this install has never fetched
  contributes nothing, and there is no attempt here to proactively fetch quest pages to improve match
  odds — that would turn a passive, free cross-reference into a network-dependent feature, which is a
  different and larger decision than "reuse data already on hand."
- If a giver's name ever collides between two *different* things (an NPC and a wiki-cached mob sharing
  a name, say), nothing here disambiguates — `questGivers` is keyed purely by string, the same
  simplification `questZones`/`questLevels` already accept.
