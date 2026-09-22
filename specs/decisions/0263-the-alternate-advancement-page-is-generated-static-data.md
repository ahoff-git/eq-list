# 0263: The Alternate Advancement page is generated static data

## Status

Accepted

## Context

The user asked for a quick-reference, searchable version of
[eqlwiki's "Alternate Advancement" page](https://eqlwiki.com/Alternate_Advancement) in the app, with a
concrete use case: "show me all the AAs that help direct damage" — a search over an ability's *effect
text*, not just its name.

`specs/wiki-data/README.md`'s Non-responsibilities section already carves out three exceptions to
"item/quest/recipe/faction data is fetched at runtime, not generated": the zone facts under
`src/shared/zones/` (a uniform MediaWiki infobox, read off every zone page the same way), Alanna's Race
Unlock Guide ([ADR 0222](./0222-a-race-unlock-guide-is-generated-static-data.md), one person's
hand-authored prose page with no template behind it at all), and "Stances & Invocations"
([ADR 0262](./0262-stances-and-invocations-are-generated-static-data.md), a uniform wikitable page that
also carries a second, derived "by class" matrix that has already drifted from the row table).

The Alternate Advancement page is the same *kind* of page as those last two — a single hand-authored
page, not a recurring template `electron/wiki/parse.ts` already classifies generically (it uses plain
`.wikitable`, never the item/quest/mob/faction pages' signature container classes or `eoTable2`/
`eoTable3`) — but, checked against its real wikitext (fetched via the API, not guessed from the
rendered page, the same discipline all three exceptions were built on), it turns out to be **the most
regular of the four**: 19 `{| class="wikitable sortable"` tables (General AAs, Archetype AAs, one per
class under Class AAs, Special AAs), every one with the identical header row `Name | Ranks | Cost |
Description`, and — unlike "Stances & Invocations" — no second, derived table to drift out of sync with
the first. The only real irregularities found: Special AAs carries one decorative `colspan` header row
above its real header, a handful of rows write their four cells one per line instead of the usual
single `| A || B || C || D` line, and one row's description wraps onto a second physical source line
with no cell marker of its own (ordinary MediaWiki paragraph continuation). None of that changes the
underlying argument for generating rather than fetching live: nothing else re-checks this page against
the live game, so a silent reformat has to fail loudly at generation time, as a reviewed diff, not
inside a shipped app — and a generic wiki-page viewer would render it as a bare, useless `item` page
anyway, the same second reason ADR 0262 gives.

## Decision

- **Shipped as committed, generated data** — `scripts/fetch-aa-list.mjs` (reusing
  `scripts/lib/eqlwiki.mjs`'s wikitext client) writes `src/shared/aa-list.generated.ts`, the same
  "generator script → committed file, hand-written lookup beside it" shape all three prior exceptions
  use. `npm run aa:list`; `--dry-run` previews the diff. `scripts/lib/aa-list-parse.mjs` reuses
  `scripts/lib/wikitext.mjs`'s heading/section/link-display primitives rather than growing a fourth
  copy of them, the same way `stances-invocations-parse.mjs`/`buff-lines-parse.mjs` already do.
- **The parser throws, by name, on anything that doesn't fit**: a missing section, a header row that
  isn't exactly `Name | Ranks | Cost | Description`, a row that isn't exactly four cells once its
  (possibly multi-line) content is folded, an empty name/description, a class subheading that doesn't
  normalize onto one of `SPELL_CLASSES`'s sixteen names, or a class left with no table at all. A bad
  regen must be impossible to commit without someone reading the error, same as every prior exception.
  `electron/tests/aa-list.test.ts` is the second net — a review the committed file itself has to pass,
  for a hand edit or merge conflict the generator's own guard can't see.
- **`ranks`/`cost` are kept as the wiki's own text**, never parsed to numbers — the same reasoning
  `parseZoneNpcs` keeps a mob's level range as text for (`electron/wiki/parse.ts`): nothing here
  computes on them, so parsing would only be a chance to get it wrong.
- **Category is a discriminated union** (`general` / `archetype` / `class` with a `SPELL_CLASSES`-typed
  `class` field / `special`) reusing the app's existing 16-class vocabulary rather than inventing a
  second one, including normalizing the wiki's "Shadow Knight" heading onto `SPELL_CLASSES`'s
  `"ShadowKnight"`.
- **A thin, hand-written lookup beside the generated file** (`src/shared/aa-list.ts`), the same split
  `stances-invocations.ts` draws over its own generated table. Its text filter matches a word anywhere
  in the name *or* the description, **literally, not fuzzily** — the same choice `word-match.ts`'s
  `matchesWords` makes (shared with `stances-invocations.ts`) and for the same reason: "which AAs help
  direct damage" is a question about whether the effect text contains those words, not a ranked
  autocomplete guess, and with a class filter already narrowing what's shown, cutting the list is what's
  needed, not scoring it. A class filter never hides a General/Archetype/Special entry, since those apply
  broadly and have no class of their own to be filtered by.
- **A new tab, `AAs`, beside `Stances`** (`AAPanel.tsx`) — the fourth shelf of the same cabinet: Items
  browses what you could wear, Spells what you could cast, Stances what you could do, this what you
  could train. Static reference data, so it carries no log gate, same as its three neighbours. Grouped
  by category (General, Archetype, each class alphabetically, Special) so the size of the list (144
  rows, against Stances/Invocations' 18) stays scannable — alphabetical rather than `SPELL_CLASSES`'s
  file-column order, the same order every class picker in the app uses, so the class filter's dropdown
  and the browse order agree; a group simply drops out once a filter leaves it empty.

## Consequences

- A fourth static-generated exception now exists, documented in `specs/wiki-data/README.md`'s
  Non-responsibilities. The rule stays narrow: each of the four exists for its own page-specific reason
  (a uniform infobox; a hand-authored guide with no template at all; a uniform-but-self-inconsistent
  two-table page; a uniform, single-table page with no signature container), not a general license to
  start generating item/quest/recipe data that already has a working runtime-cache path (ADR 0003).
- The data goes stale the moment the wiki page is edited, until someone re-runs `npm run aa:list` and
  commits the diff — no schedule regenerates it, same as the other three.
- This ships **reference data only** — it does not track which AAs a character has actually purchased,
  unlike the race-unlocks feature's own ledger join (ADR 0222) or the damage meter's *observed*
  stance/invocation tracking (ADR 0020). Nothing here reads the log, and nothing in the log could
  answer "which AAs does this character have" even if it tried.
