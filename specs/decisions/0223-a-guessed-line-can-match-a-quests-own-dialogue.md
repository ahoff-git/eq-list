# 0223: A guessed line can match a quest's own dialogue

## Status

Accepted

## Context

[ADR 0221](./0221-a-guessed-speaker-can-name-a-quest-giver.md) named every quest a dialogue-guessed
speaker is a known giver of, but deliberately stopped there — a giver commonly hands out several
quests, and nothing narrowed *which*. That ADR explicitly declined to match the observed dialogue's
own text against the wiki's quest pages, because a survey of real eqlwiki pages found dialogue
scattered across inconsistent HTML with real transcription errors — matching a logged line against
that whole corpus would mean trusting a lot of unreliable text.

The user pushed back with the right observation: a quest giver only ever has a handful of quests, so
once the giver is already known (a much more reliable claim than the timing guess itself), the actual
search space for a text match is small — that giver's own two or three quests, not the wiki's several
thousand. "If you can't find a match then default to the giver, but you really should be able to match
some of the dialog."

Re-examining the wiki HTML with that narrower claim in mind changed the picture:

- **Text extraction is far more tractable than tag-shape extraction.** The earlier survey worried about
  `<dl><dd>`, `<p>`, `<ul><li>` and `<blockquote>` all holding dialogue inconsistently — but
  `node-html-parser` already strips tags and decodes entities when reading an element's `.text`, so a
  reader that doesn't care *which* tag holds a line, only whether its plain text reads as
  `"Name says/tells you, '...'"`, sidesteps almost the entire tag-shape problem. What's left — a
  transcription missing its opening quote, or a stray inline tag splitting a sentence — simply fails
  the pattern and that one line is silently absent, never captured wrong.
- **Section headings vary too much to filter by name.** A first attempt scoped extraction to the
  existing "Walkthrough" section merge (already built for turn-in parsing) and found real
  counter-examples immediately: `quest-rogue-redemption.html` files its dialogue under a "Checklist"
  heading and, worse, under per-step `<h3>` sub-headings ("Gem of Stamina") that a
  `/walkthrough|checklist/i` filter never reaches at all; `quest-acumen-mask.html` uses a heading
  named plainly "Dialogue". Chasing every heading name a page might use is a losing game — reading the
  **whole page's** `<dd>`/`<p>`/`<li>` elements and letting the dialogue-shaped pattern itself be the
  filter is simpler and catches all three shapes without knowing which one applies in advance.

## Decision

- **`electron/wiki/parse.ts`**: `parseQuestDialogue(content)` reads every `<dd>`, `<p>` and `<li>` on
  the whole parsed page (not scoped to any one section), tests each element's plain text against
  `WIKI_DIALOGUE_RE` (the same "Name says/tells you, '...'" grammar `faction-cause.ts`'s `DIALOGUE_RE`
  reads off a live line, kept as an independent copy since the two sources — a raw log line vs.
  already-tag-stripped DOM text — are allowed to drift). Stored as `WikiPage.dialogue?: {npc,
  text}[]`, present only for `kind: "quest"` pages that had at least one matching line.
- **`electron/wiki/index.ts`**: a fourth cross-reference on the same `buildCatalogue()` walk ADR 0221
  added the giver map to — `questDialogue: Map<string, {npc,text}[]>` (quest title, folded → its own
  lines), exposed as `WikiClient.questDialogueSource(): (questTitle: string) => {npc,text}[]`, the
  same no-op-until-the-first-walk contract as its three siblings.
- **`src/shared/faction-cause.ts`**: `FactionCauseTrackerDeps` gains `questDialogue?: (questTitle) =>
  {npc,text}[]`. When a dialogue cause's speaker gives more than one quest, `narrowByDialogue` gathers
  every candidate quest's own lines and ranks them against the observed text with `fuzzyScore`
  ([src/shared/fuzzy.ts](../../src/shared/fuzzy.ts) — already proven for the search box, reused rather
  than inventing a second similarity measure). A match above `DIALOGUE_MATCH_MIN_SCORE` (0.5, a
  starting guess like the two time windows) narrows `FactionCause.quests` to the matching quest(s) and
  sets `questsMatched: true`; no match, no dialogue cached for any candidate, or only one candidate to
  begin with (nothing left to narrow *to*) leaves `quests` as the giver's full list, `questsMatched:
  false` — the "default to the giver" the user asked for.
- **UI**: the Faction tab's Hits table shows a matched quest's name plainly; an unmatched (or
  unmatchable) list is prefixed "possibly", and the tooltip states outright which case it is.

## Consequences

- A real turn-in, for a giver whose quest pages are cached, now often names the *specific* quest
  rather than a list of everything that giver happens to give — genuinely closer to "the name of the
  quest" than ADR 0221 could get alone.
- `DIALOGUE_MATCH_MIN_SCORE` is unverified against real data, same as both time windows — `fuzzyScore`
  was tuned for short item-name queries, not sentence-length prose, so this threshold is a plausible
  starting point rather than a measurement. Worth revisiting once real matches (and real near-misses)
  have been observed.
- Coverage still depends entirely on what's cached: a candidate quest whose page was never fetched
  contributes no dialogue to compare against, same limit ADR 0221 already named for the giver lookup
  itself.
- Extraction is deliberately whole-page rather than section-scoped, which means it would also pick up
  a dialogue-shaped sentence anywhere else on a quest page (an infobox aside, unrelated lore) if one
  happened to exist — accepted as a low, unmeasured risk given how narrowly-themed a quest page
  actually is, in exchange for not depending on a heading-name filter that real pages already defeat
  three different ways.
