# 0262: Stances and invocations are generated static data

## Status

Accepted

## Context

The user asked to bring [eqlwiki's "Stances & Invocations" page](https://eqlwiki.com/Stances_%26_Invocations)
into the app as its own reference chart: which classes can use which melee stance or casting
invocation, and — the same question read the other way — which stance or invocation a given
combination of classes can bring between them.

Nothing today reads this page. The app already has two separate, narrower relationships with the same
two words:

- The damage meter tallies **which** stance/invocation was active for a cast or a swing, entirely from
  the log's own naming lines, with **no enumerated list at all**
  ([ADR 0020](./0020-split-by-stance-and-invocation.md)) — deliberately, since a hard-coded list had
  already missed real names the log produced. That's an *observed* question ("what was up for this
  hit") and stays exactly as it is; this feature answers a *planning* one ("what could this class
  bring") that ADR 0020 never touches.
- `specs/wiki-data/README.md`'s Non-responsibilities section carves out exactly two exceptions to
  "item/quest/recipe/faction data is fetched at runtime, not generated": the zone facts under
  `src/shared/zones/` (a uniform MediaWiki infobox, read off every zone page the same way, for facts
  that change essentially never) and Alanna's Race Unlock Guide
  ([ADR 0222](./0222-a-race-unlock-guide-is-generated-static-data.md), one person's hand-authored
  prose page, the only place on the wiki stating faction-point deltas at all).

"Stances & Invocations" fits neither exception exactly, but sits closer to the zone facts than to
Alanna's guide once its real wikitext is read (fetched via the API, the same discipline both existing
exceptions were built on — never guessed from the rendered page): it's **one uniform, three-column
wikitable per section** (`Name | Description | Classes`), not hand-written prose. It also, unlike
either existing exception, carries a *second* table restating the same facts as a class×ability
matrix — and that second table has already drifted from the first: the Invocations matrix spells a
row `Empowering` where the row table above it spells the same ability `Empower`. That settles which
table is the source of truth (the row table only; see `scripts/lib/stances-invocations-parse.mjs`'s
header) and confirms the page is not perfectly machine-uniform either, which is why this is a third,
separate exception rather than a widening of the zone-facts one.

The two real constraints, same shape as both prior exceptions:

- **It's wanted as a standalone chart, before anything else is on screen**, and it's a fact about
  EQL's class design that changes about never — the zone facts' own reasoning, restated for a
  different page.
- **A generic wiki-page viewer can't render it.** `WikiPageView`/`electron/wiki/parse.ts` classify a
  page by a signature container class (`.mobStatsBox` → mob, `table.questTopTable` → quest, etc.) and
  fall back to `item` for anything else — which this page would hit, showing a bare title with no
  stat card and nothing useful. A generated, purpose-built view was going to be needed regardless of
  where the data lived.

## Decision

- **Shipped as committed, generated data** — `scripts/fetch-stances-invocations.mjs` (reusing
  `scripts/lib/eqlwiki.mjs`'s wikitext client) writes `src/shared/stances-invocations.generated.ts`,
  the same "generator script → committed file, hand-written lookup beside it" shape the zone facts and
  the race unlock guide already use. `npm run stances:fetch`; `--dry-run` previews the diff.
- **Only the row table is parsed, never the derived "by class" matrix** — see the `Empower`/
  `Empowering` drift above. `scripts/lib/stances-invocations-parse.mjs` reads
  `Name | Description | Classes` by line (a cell's content runs from the line that opens it to
  whatever closes it, the same discipline `race-unlocks-parse.mjs` uses for a multi-paragraph cell),
  strips `<section begin/end>` markers and resolves `[[Link]]`/`[[Link|Display]]` to plain display
  text, and splits the `Classes` cell on `<br>`/`&nbsp;` into the wiki's own three-letter codes.
  Section-boundary and link-display logic reuse `scripts/lib/wikitext.mjs` (heading depth, section
  slicing, `linkDisplay`) rather than growing a third local copy of what `race-unlocks-parse.mjs` and
  `buff-lines-parse.mjs` already needed — only the wikitable-cell walk is specific to this page, since
  neither sibling parser reads a pipe table.
- **Classes stay as the wiki's own codes in the generated file**, translated to the app's `ClassName`
  vocabulary (`class-names.ts`) in the hand-written `src/shared/stances-invocations.ts`, not in the
  generator — the generator is a standalone Node script with no reason to depend on the app's TS
  build, the same split `race-unlocks.generated.ts`/`race-unlocks.ts` already draws.
- **The parser throws, by name, on anything that doesn't fit**: a missing heading, an unexpected
  header row, a row with other than three cells, an empty description, an unrecognized class code. A
  bad regen must be impossible to commit without someone reading the error, same as both prior
  exceptions. `electron/tests/stances-invocations.test.ts` is the second net — a review the committed
  file itself has to pass, for a hand edit or merge conflict the generator's own guard can't see.
- **A new tab, `Stances`, beside `Spells`** (`StancesPanel.tsx`) — the third shelf of the same
  cabinet: Items browses what you could wear, Spells what you could cast, this what you could *do*.
  Static reference data, so it carries no log gate, same as its two neighbours. One filter answers
  both directions the user asked for: a `FacetPicker` class filter (reusing `class-names.ts`'s
  `CLASS_SEARCH_ALIASES` exactly as the Items/Spells tabs already do) narrows to a combination of
  classes, and each surviving row's own class chips — lit for a ticked class, dim otherwise — are read
  across to see who has it; a text filter matches a word in the *description*, not just the name, so
  "what gives me double attack" (Ranged Stance) works without knowing the ability's name first. No
  16-column matrix table: eighteen rows of class chips read better in a narrow panel than a table wide
  enough to need horizontal scroll, and the wiki's own matrix is redundant with the row table anyway.

## Consequences

- A third static-generated exception now exists alongside the zone facts and the race unlock guide,
  documented in `specs/wiki-data/README.md`'s Non-responsibilities. The rule stays narrow: each of the
  three exists for its own page-specific reason (a uniform infobox; a hand-authored guide with no
  template at all; a uniform-but-self-inconsistent two-table page), not a general license to start
  generating item/quest/recipe data that already has a working runtime-cache path (ADR 0003).
- The data goes stale the moment the wiki page is edited, until someone re-runs
  `npm run stances:fetch` and commits the diff — no schedule regenerates it, same as the race unlock
  guide.
- Nothing here reads or writes the damage meter's own stance/invocation tracking (ADR 0020) — the two
  features share vocabulary because EQL does, not because either depends on the other. A spell/ability
  name typo on the wiki page would show up here and nowhere near the meter, and vice versa.

