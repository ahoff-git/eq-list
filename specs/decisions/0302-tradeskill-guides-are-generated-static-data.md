# 0302: Tradeskill guides are generated static data, and their era is judged live

## Status

Accepted

## Context

The user asked for tradeskills in the app, linking eqlwiki's leveling guides
([Jewelcrafting](https://eqlwiki.com/Jewelcrafting), [Category:Tradeskills](https://eqlwiki.com/Category:Tradeskills)),
and to respect "out of era".

The category holds 21 pages: nine skills (`Skill Alchemy` … `Skill Tinkering`, plus `Jewelcrafting`),
eleven `Cultural Tradeskills: <Race>` pages, and `Tradeskill Equipment`. Read against the real pages
before anything was written:

- **Every skill page writes its guide differently.** A `{| wikitable` (Alchemy, Tailoring), a raw
  `<table>` with bullet lists in its cells (Baking), `'''1 to 21:''' [[Metal Bits]]` bullets
  (Blacksmithing, Brewing), `Trivial 17 - [[Silver Bar]] + [[Malachite]]` lines under range headings
  (Jewelcrafting), `{{:Banded Belt}}` item transclusions. There is no template, so there is no field
  for "skill range", "trivial" or "result" to be read from — and the steps carry reasons ("needs a
  Cyclops Skull from South Karana") that no such field could hold.
- **The guide headings are findable.** On all nine pages the guide sits under a heading matching
  *level / progression / raising / skill up* ("Recommended Leveling", "Skill Progression", "Raising
  Tinkering Skill"), sometimes two of them (Baking's quick and detailed guides).
- **The era signals are in the rendered page, not the wikitext.** `{{Velious Era Inline}}`,
  `{{Era Short|Kunark}}` and `{{Classic Era Short}}` all render to `span.era.<key>-era`; an item
  transclusion renders to `.hbdiv > a`. Editors have already commented out the Velious rows of
  Tailoring's table, so what renders is mostly in era — but not all of it: four Tailoring rows are
  marked `Unknown` era (the race-only masks), Baking's last step needs `Dragon Meat` (a Velious-era
  item), and Jewelcrafting's last stage says in prose that "Velium is not currently available in
  Everquest Legends".
- **The cultural pages are all out of era**: ten are in `Category:Epic Quests Era`, Gnome's is
  `Velious Era`. They are recipe catalogues, not leveling guides.

## Decision

**Generated, like the AA list and the other hand-authored guides** (ADR 0222, 0263, 0264):
`scripts/fetch-tradeskills.mjs` (`npm run tradeskills:fetch`, `--dry-run` to preview) writes
`src/shared/tradeskills/tradeskills.generated.ts`. Nothing re-checks the guides at runtime, so a
reformat has to show up as a reviewed diff, and the parser (`scripts/lib/tradeskills-parse.mjs`)
throws by name on an element it has never seen, on a skill page with no guide heading, and on a guide
that links nothing.

**Read from the rendered HTML, not the wikitext** — the first generator here to do so — because the
templates that matter (era badges, item transclusions) only become uniform once MediaWiki has
expanded them. `node-html-parser` is already the app's HTML parser.

**The guide is kept as the wiki wrote it**: headings, paragraphs, nested lists and tables, each line a
run of text, page links and era markers. Interpreting it into steps would invent a structure the wiki
doesn't have, and lose the reasons attached to each step.

**Era is facts at generation, judgement at runtime** (`tradeskill-era.ts`), the same split ADR 0210
draws for spells. The generated file keeps the era keys of each page, the era keys of each linked
**item** (`Category:Items` only — a zone or NPC named in passing says nothing about the step), and
`Template:PageEra`'s `in` list on the day of the scrape. A line is out of era when:

- the wiki put a shut era's badge on it;
- it is a **step** (a bullet or table row, not a paragraph) and links an item of a shut era, or a
  GM-event item (ADR 0292);
- it sits under a subheading whose own prose says the server doesn't have it.

Kunark and Velious are judged **live** through `expansionOpen` over the out-of-era zone list, so the
day either opens their steps come back without a regen. Luclin is "not on this server". Every other
era key (Epic Quests, Unknown, Hole VP…) has no zones to judge by and uses the scrape's `in` list —
as does everything when the live list is empty, since an unreachable wiki is not every era opening.
The `in` list rather than the `out` one because the template's `#default` is `out`.

**The cache is asked before the wiki.** Most linked pages are already in the committed web snapshot
of the page cache (`public/data/wiki-cache`, read by `scripts/lib/wiki-snapshot.mjs`), with their
kind and era flag. A cached non-item, or a cached item flagged in era, needs no request. A cached
item flagged out of era is still fetched, because the flag doesn't say *which* era, and Velious
can only be judged live if its key is known. On the first run that left 20 of 309 linked pages to
fetch. The skill pages themselves are always fetched, because the cache keeps them parsed and the
guide is read from the rendered HTML.

**A new tab, `Tradeskills`, after `AAs`** — what you could *make*, beside what you could wear, cast, do
and train. One skill at a time (a segmented picker), each guide with a "↗ leveling guide" button that
lands on its heading on eqlwiki, items hoverable and openable in-app like everywhere else. An
**"in era only"** toggle, on by default like the Items and Spells tabs, leaves out shut lines and
subsections and says how many it left out; off, they are dimmed and badged with the reason on hover.
The cultural pages and `Tradeskill Equipment` are links out, under the guides, subject to the same
toggle.

**A step that names only ingredients is told what it makes.** Jewelcrafting's guide is a list of
`Trivial 17 - Silver Bar + Malachite`, never naming the ring. The generator indexes every recipe in
the page cache by its set of ingredients (`scripts/lib/tradeskill-results.mjs`) and gives a step whose
ingredients are *exactly* one recipe's a `makes` field, shown as "→ makes Silver Malachite Ring".
Counts are ignored, and `Enchanted X` matches `X`, because recipe pages list the enchanted bar and the
guide says the plain one skills up. A step that already links something crafted ("Result: …"), or
sits under a bullet that does, is left alone. All 19 Jewelcrafting steps that named no result
matched exactly one recipe, and the one checked against the wiki (Silver Malachite Ring, trivial 17)
agrees with the guide's trivial. A found result counts as a link for the era check and names the
step's "+ List" group.

**Each step says how many combines, how much of each material, and roughly what it costs.** All of it
is settled when the guides are generated, because prices are as static as the guides:

- *The skill span* (`step-plan.ts`) is read where a reader reads it: a step that opens with both ends
  ("1 to 21:", "88-108"), or only the end ("Trivial 17", "up to 168:", "Flameless Lantern to 68"),
  which starts where the step before it ended; a stage heading's range ("(1-34)"), a bold label's
  ("1 - 202 Skill"), and "you start at 50" move the start. A number further into a sentence ("about
  40-55 attempts") is not a span, and a bullet without a span is an instruction and gets no figures.
- *Combines* (`step-cost.ts`) are a range. The floor is exact, one per skill point, because a combine
  can't raise a skill by more. The ceiling uses the slowest rate the guides themselves measured: 2.5
  combines a point below 150 (Blacksmithing at 370 STR: 1.7–2.5) and 7.5 above (Tailoring at 451 WIS:
  7.3).
- *Materials* are one combine's needs times that range, since a failed combine uses them up too. A
  count on a "Buy …" line is the whole step's purchase and isn't multiplied.
- *Prices* come from the wiki's own words. There is no price field, so an item's `notes` ("Costs around
  0.524pp") come first, then the skill pages' cost tables. A page that states one unit for its costs
  uses it for its bare numbers; a bare number on a page that states none is skipped rather than
  guessed at. Item notes outrank tables because a table can sit stale: Alchemy's "Reagent Pricing" is
  flagged "Needs updating" and prices Birthwort at five times Birthwort's own page.
- *A combine's cost* is, most direct first: what the step states ("~32pp per combine"); a skill page's
  price for the whole combine of what it makes (Jewelcrafting's crafted-item table, Tinkering's "Cost
  to Make"); the sum of its priced materials; or a partial sum, marked "+", that names what has no
  price.

Checked against what the wiki reports: Jewelcrafting to 162 sums to 817–2,691pp over 161–465 combines,
and the two players the page quotes spent 1,410pp and about 2,500pp. Alchemy's Sickle Leaf path comes
to 1.05pp a combine, where the guide says "about 1pp". **+ List** files the same planned materials,
with the group's runs set to the step's floor.

**It reads like an item or quest page** (`.page-detail`: gold section headings, blue links), and it
is for crafting:

- **Hovering an ingredient** shows the stat card plus a crafter's lines (`craft-notes.ts`): which
  merchants sell it (two, then a count), judged against the era like every other source, or else how
  it comes (drops, forage, quest); what it's made from; how many recipes use it. `ItemLink` takes an
  optional `craft` flag for this, and nothing else in the app sets it.
- **Each step has "+ List"** (`step-materials.ts`, `addStep`), which files what the step needs on
  the shopping list as a recipe named for the step. The list already says where to get each row and
  scales a group by its runs, so "where to buy" and "how many combines" need nothing new. What the step
  needs is read from its shape: a table header says which column is the result, a nested bullet says
  what goes into the bullet above it, and for a lone bullet an item the wiki shows as crafted is the
  result. Each linked page is read so a zone or an NPC is never listed. A step that names only what to
  make lists that recipe's ingredients.

## Consequences

- A tenth generated-data exception (`specs/wiki-data/README.md`), for the same narrow reason as the
  others: a hand-written page with no template. It goes stale when the wiki is edited, until someone
  re-runs `npm run tradeskills:fetch`.
- Rendered HTML means the generated guide is what the wiki showed on the scrape day, so a row an
  editor has commented out isn't there to badge. That leans the safe way: the wiki's editors and this
  tab agree that a hidden row is not for today.
- The prose rule ("not currently available…") is the guide's own claim and is not re-judged live; it
  changes when the page does.
- The tab tracks nothing — not your skill levels, not what you have made. The log parser reads no
  skill-up line today; a skill tracker would be its own decision.
