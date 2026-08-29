# 0152: An item search is a filter with your own yardstick

## Status

Accepted

Adds the Items tab. Sits beside [ADR 0003](./0003-eqlwiki-runtime-data-source.md) (items are fetched
at runtime and cached, never baked at build), [ADR 0057](./0057-a-grade-is-not-an-identity.md) (a
grade is not a second item) and [ADR 0124](./0124-lucy-is-a-second-opinion.md) (Lucy is the third
opinion, and says so).

## Context

Everything the app can do with an item begins with knowing its name. The Search tab is a name
lookup — fuzzy, forgiving, and answering "where is the page for *Cloak of Wisdom*". The shopping
list, the hunt, the loot ledger and the drop reconciliation all start from a name you already have.

The question a player actually spends an evening on is the other one: **"what is the best thing I
could be wearing on my fingers?"** No name lookup can answer it, because the whole point is that you
don't know the name yet. And by now the app is sitting on the material to answer it — a few hundred
parsed item pages on disk, each carrying the stat card the wiki prints, held verbatim as lines of
text because a hover tooltip is all anything had ever wanted from them.

Three things had to be decided before that data could answer a question.

**What the corpus is.** eqlwiki is stock MediaWiki with no structured item data and no way at all to
ask it for "every item, with its stats" — that is exactly why ADR 0003 chose runtime fetching in the
first place. The alternatives were to crawl the whole title index (tens of thousands of pages, on
someone else's server, to build something that would be stale in a week) or to accept a smaller,
honest corpus.

**What a criterion may do.** A faceted search can be built two ways. It can rank — score everything
against what you asked and show near-misses in order — or it can filter. Ranking is what a search
engine does and it is very hard to debug: when the thing you expected isn't in the list, you cannot
tell whether it failed a condition or merely scored badly.

**What "best" means.** A cleric and a wizard do not agree about a +10 WIS ring, and this app has no
idea which one is reading it: nothing here knows the player's class, and
[ADR 0149](./0149-a-debuff-is-only-tracked-if-it-is-yours.md) has already refused to infer one. Any
built-in ranking would be this app's opinion about EQ itemisation wearing an authoritative face.

## Decision

**The Items tab is a subtractive filter over the item pages already cached, scored by weights the
player sets.**

- **The corpus is the cache, and nothing fetches.** `wiki.cachedItems()` and `lucy.cachedItems()`
  read their own cache directories and make no request, warm no index and crawl nothing. The
  catalogue is therefore *what you have already looked at* — it grows as you browse, and the panel
  says how many items are in it rather than implying it is every item in the game. The wiki's copy
  wins where both caches hold a name, folded by `normalizeItemName` so a `+2` is not a second item
  (ADR 0057), and a Lucy row is badged as one (ADR 0124).
- **Every criterion only ever removes rows.** Nothing widens, ranks by relevance, or helpfully adds
  near-misses back. Several values ticked in *one* facet are an *or* — "fingers or neck" is a single
  thought — and across facets it is an *and*; that is the only asymmetry, and the facet as a whole
  still only narrows. The name box is a literal word match rather than the fuzzy one the Search tab
  uses, because fuzz here would let a criterion *add* rows.
- **A card that never mentioned a stat fails a floor on it.** "At least 5 INT" asked of a card that
  is silent about intelligence has no yes to give. Silence is not a zero that might squeak through —
  that is how a filter starts admitting what it was told to cut.
- **Value is a dot product with the player's own weights.** `{ int: 2, wis: 1 }` means ten wisdom is
  worth exactly five intelligence. An unweighted stat contributes nothing, so an empty weight sheet
  gives every item a value of 0 and the column says so rather than inventing a ranking. Negative
  weights are supported and wanted, for the two stats where less is better.
- **A stat earns a column by being asked about.** The columns are the stats you have weighted or set
  a floor on; twenty-one stat columns would be unreadable, and the ones you are thinking about are
  the ones you have just typed a number into.
- **Reading a card is its own tested black box.** `src/shared/item-stats.ts` turns `ItemCard.lines`
  into numbers, and it is **label-anchored**: it looks for stat names it knows rather than matching
  "anything before a colon", because the general form reads `Skill: 1H Slashing Atk Delay: 20` as a
  stat called `Slashing Atk Delay` and silently loses every weapon's delay.

## Consequences

**The app can answer a question it could not ask before**, from data it already had. Nothing new is
fetched, no build step is added, and the feature costs the wiki nothing.

**The catalogue is small, and visibly so.** Two hundred and ninety items today, not the game's
thousands. This is the honest consequence of ADR 0003 rather than a defect to be fixed by crawling:
a corpus that grows as you use the app is one you can trust the provenance of, and the empty state
says what feeds it. If a full index is ever wanted it should arrive as a *supplied* data file that is
checked rather than trusted, the way the zone gazetteer did
([ADR 0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md)) — not as a crawl.

**A result count you can reason about.** Because criteria only subtract, the count falls as you add
conditions, and "why isn't it there?" is answered by removing conditions one at a time. That is the
whole payoff of refusing to rank.

**The Value column is blank until you say what you value.** A first-time reader sees zeros and a
sentence explaining the weight sheet, rather than a ranking they might mistake for the app's advice.
This is deliberate: an invented default would be read as authoritative on exactly the question this
app has no standing to answer.

**Stat coverage is only as good as the cards.** A card that omits a stat leaves it unknown, which is
the correct reading and does mean a floor cuts more than a player might expect. Twenty-one stats are
read today; a twenty-second is one row in `STAT_ALIASES`, and anything the cards don't print — a
required level, a proc's damage — cannot be filtered on at all.

**Lucy's items are searchable alongside the wiki's**, and are the one place a claim from a different
game enters a comparison. They are badged, they lose a name collision to the wiki, and they are gated
by `settings.askLucy` at the IPC boundary like everything else of Lucy's — but a player sorting by
value will see them ranked together, which is a thing ADR 0124's "no competing with a wiki page"
stops just short of. Accepted because the badge is on every row and the alternative is a catalogue
that silently omits items we hold.
