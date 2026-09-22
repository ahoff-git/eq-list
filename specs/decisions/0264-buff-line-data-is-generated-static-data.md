# 0262: Buff-line data is generated static data

## Status

Accepted

## Context

The user asked to bring [eqlwiki's Buff Lines guide](https://eqlwiki.com/Buff_Lines) into the app
and use it to say what stacks with what. The guide groups every beneficial spell/item effect first
by which statistic it buffs, then into "buff lines" — the buffs that can't be up on the same target
at once, because the game only ever keeps the strongest one in a slot.

Neither of the app's two spell/buff subsystems has any stacking concept today. The **Buffs tab**
(`src/shared/buff-tracking.ts`, `electron/buff-tracker.ts`, `BuffPanel.tsx`) tracks what's up or
known from the player's own log; the **Spells catalog** (`spell-search.ts`, `SpellCatalogTable.tsx`)
is sourced from cached eqlwiki spell pages. Both key a spell the same way, through `buffKey()`
(`buff-tracking.ts`) — a rank-suffix-stripped, lowercased identity — which is the join point this
feature hangs off.

The wiki source itself doesn't fit either existing pattern. It isn't a uniform per-spell template
like the pages `electron/wiki/parse.ts` reads at runtime (ADR 0003) — it's one large (~2,200 line),
hand-authored guide: nested `==`/`===`/`====` headings, bullet lists with real formatting drift
(a bard song's dual-value parenthetical, a stray percentage sign, an occasional missing bullet
marker), and free prose this feature has no need to touch. This is the same shape ADR 0222 already
ruled on for Alanna's Race Unlock Guide — ship it as **committed, generated static data**, not
through the runtime wiki cache, because a page like this can be reformatted by its author at any
time in a way no generic parser can anticipate, and a silent break belongs in a diff to review, not
in a shipped app.

Reading the real wikitext (via the API, not the rendered page, matching the discipline
`race-unlocks-parse.mjs`'s own header holds itself to) turned up one useful simplification: a spell
that contributes to more than one buff line (a "combination" buff) simply appears as a bullet under
more than one `====` heading. Membership-by-heading, taken as-is, already encodes "conflicts with
everything under either group" — no special-case handling of the guide's own multi-column
combination-buff tables was needed, and those tables (a derived maximum-value summary, not a
primary fact) are never parsed at all.

## Decision

- **Shipped as committed, generated data** — `scripts/fetch-buff-lines.mjs` (using the existing
  MediaWiki client, `scripts/lib/eqlwiki.mjs`) writes `src/shared/buff-lines.generated.ts`, the same
  "generator script → committed file, hand-written lookup beside it" shape ADR 0222 established.
  `npm run buffs:lines` re-runs it; `--dry-run` previews the diff without writing.
- **A new, small `scripts/lib/wikitext.mjs`** holds the heading/section-slicing/link-display
  primitives the new parser needs (`headingLine`, `headingsAt`, `sectionLines`, `linkDisplay`) —
  the same primitives `race-unlocks-parse.mjs` already proved out for its own guide page.
  `race-unlocks-parse.mjs` keeps its own local copies rather than importing this file: it's a
  working, tested black box (`electron/tests/race-unlocks.test.ts`), and this feature doesn't touch
  it. The result is a small, deliberate duplication of ~25 lines rather than a refactor of code that
  already works and wasn't asked for.
- **Only the structurally regular parts are parsed**, by `scripts/lib/buff-lines-parse.mjs`: each
  buff line's category/stat/label (from the guide's own heading nesting) and its member bullets
  (`* +52 [[Deliriously Nimble]] ([[Shaman]] 53)<br>` → spell, signed bonus, and everything else on
  the line kept as one free-text `detail` rather than broken down further — the task is "what
  shares a line with what," not a second class/level table). A percentage bonus (a handful of Haste
  rows) is kept apart in `unit` rather than silently read as a flat amount.
- **The parser throws, by name, on structural breakage** — fewer than 3 category sections, fewer
  than 100 buff lines found (the real page has 112) — but tolerates line-level formatting drift
  within a line's own body (a missing bullet marker, a second parenthetical value) by reading it
  more loosely rather than rejecting it, since the guide's real wikitext turned out to vary in
  exactly those small ways from row to row. `electron/tests/buff-lines.test.ts` is the second net on
  the *committed* file, the same role `race-unlocks.test.ts` plays for the race-unlock guide.
- **Joined against live state at render time, never baked into the generated data**:
  `src/shared/buff-lines.ts` exposes `buffLinesFor(spell)` and `shareBuffLine(a, b)`, both keyed
  through the existing `buffKey()`. Surfaced two places: a "Buff Line" column on the Spells catalog
  (`SpellCatalogTable.tsx`, reference data, browsable without anything being up), and on the Buffs
  tab (`BuffPanel.tsx`) — a static line label on each known spell's row, and a "won't stack" warning
  on an *active* row when another buff up on the same target shares its line. The second case is the
  one that actually matters: the tracker only reports what the log said went up, never what the
  game kept, so two same-line buffs both showing "up" means one of the two rows is almost certainly
  stale — the same kind of admitted doubt `alsoCouldBe` already models for a shared fade sentence.

## Consequences

- A fifth generated-static exception now exists alongside the zone facts, the race-unlock guide,
  Stances & Invocations (ADR 0262) and Alternate Advancement (ADR 0263), documented in
  `specs/wiki-data/README.md`'s Non-responsibilities. It sits with the race-unlock guide rather than
  the two uniform-template exceptions: the rule stays exactly as narrow as ADR 0222 left it — for a
  page that is itself hand-authored and irregular, not a reason to widen the item/quest/recipe
  runtime-cache rule (ADR 0003).
- The data goes stale the moment the guide is edited, until someone runs `npm run buffs:lines` again
  and commits the diff — same tradeoff ADR 0222 already accepted for the race-unlock guide.
- `detail` on a member is exactly what the guide's own row says, imperfections included (the guide
  itself has the odd unbalanced parenthesis) — it's shown as reference text, never parsed further,
  so a wiki typo shows up as a slightly odd sentence rather than a wrong stacking answer.
- The Buffs tab can now say "these two won't stack," but still cannot say *which one actually won* —
  the game doesn't log that, so the tracker keeps reporting both as up rather than guessing which to
  drop. This is the same restraint `KnownBuff.durationSeconds` already shows about not inventing a
  countdown the log never gave it.
