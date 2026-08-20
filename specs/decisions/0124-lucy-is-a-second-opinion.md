# 0124: Lucy is a second opinion, asked last and quoted rather than believed

## Status
Accepted

## Context
[ADR 0003](./0003-eqlwiki-runtime-data-source.md) made eqlwiki the app's data source and
[ADR 0025](./0025-observation-over-the-wiki.md) put your own kills above it. Then
[ADR 0103](./0103-search-can-answer-from-your-own-log.md) found the hole neither covers: **a name
nothing in the app has heard of.** Its case was `Desecrated Kejaar Totem` — in the player's bags, in
the loot ledger, and absent from eqlwiki entirely — and its answer was to search your own log too.

That answer only reaches items **you have already held**. Search for something you have merely *seen*
— on a corpse someone else looted, in an auction, on a tooltip in a screenshot — and the app still
says nothing at all. And even for a name your log knows, the app cannot say what the item *is*: a
loot ledger records that you had one, never what slot it goes in or who can wear it.

[Lucy](https://lucy.allakhazam.com) covers exactly that gap. It is Allakhazam's **Live EverQuest**
item database: item ids in the six figures, twenty-five years of expansions, and a per-item page
carrying the in-game tooltip verbatim plus every mob known to drop it and every merchant known to
sell it. `Rusty Short Sword` there has a full stat card and **166 sources**.

It is also, plainly, a source about **a different game**. Live EverQuest in 2026 is not EQ Legends,
and it is further from it than eqlwiki is — eqlwiki at least describes an ancestor of this build,
while Lucy describes a sibling that kept growing. Its catalogue is mostly items that cannot exist
here.

Four things about the real site were measured before deciding anything, and three of them constrain
the design:

- **It has no era or expansion field.** Not on the item page, and not in the 300-column raw dump
  behind `itemraw.html` either. There is nothing to filter on directly.
- **It demands a session cookie and refuses with a `200`** whose whole body is a meta-refresh to
  `…&setcookie=1`. Any cookie value satisfies it.
- **It sits behind CloudFront, which caches on the URL and ignores the cookie.** So a cookieless
  request doesn't merely fail — it puts *the refusal* in a shared cache under the URL you wanted.
- **A search matching one item `302`s to that item's page**, so a one-hit search hands back a page
  you would otherwise fetch twice.

## Decision
**Add Lucy as a third data source, ranked below eqlwiki, asked only where eqlwiki is silent, and
presented as a quotation from another game rather than as a fact about this one.**

**The ladder gets a third rung, in this order:** eqlwiki's index, then your own log
(ADR 0103), then Lucy. A name search asks Lucy only when the first two returned **nothing** — so an
item either of them knows never costs a request to someone else's site, and Lucy can never outrank
them by arriving first. Its results sit under their own blunt heading, *"From Lucy · Live EverQuest,
not this build"*, for the same reason ADR 0103 gave your log one: a row from a different game is a
different kind of claim and must not read as one of the wiki's pages.

**A Lucy row opens; it does not add.** Every other row in the search panel has a `+ Add` button,
because every other row is either the wiki's or your own. Adding straight off a Lucy row would put an
item on a shopping list on the strength of a source that has not yet been asked whether the thing
exists in this era at all — so the row opens the item, and the page it opens has the button.

**Every item carries a ↗ Lucy link, beside its ↗ eqlwiki one** — both item page headers and every
shopping-list row. This needs no id and costs no request, which is the only reason it can be
unconditional: the link goes to Lucy's **search** when we haven't fetched the item, and a search
matching one item redirects to it (`Rusty Short Sword` → `item.html?id=5013`), so the browser resolves
the name and this app never asks. A name Lucy hasn't got lands on "0 found", which the hover says. The
distinction worth keeping is that **a link is an offer and a block is an answer**: the link appears
even on a fully-described wiki page, where the `LucySays` block deliberately does not.

**Era is derived from the zones, and says so.** With no era field, the only signal Lucy gives is
**where it says the item can be got** — the zones on its "Drops from" and "Sold by" rows — and we
already ship the list of zones this server runs
([ADR 0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md)). So `src/shared/lucy-era.ts`:

- a zone we can place → **in era** (at least one place you could go);
- zones, none placeable → **out of era** (Kael Drakkel, Shar Vahl, `Stratos: Zephyr's Flight`);
- no zones at all → **unknown**, and *shown* as unknown rather than guessed.

"Unknown" is a third state on purpose, and it is a common one — a quest reward or a crafted good has
no zones to judge. It is **not hidden by the "hide out of era" toggle**, because hiding what you
couldn't judge is how a filter starts lying. The badge is a question mark and the hover names the
zone that decided it: *"Lucy places it in Innothule Swamp 2.0 (and 33 others), which this server
runs"* is a sentence a player can check, and "out of era" on its own is not. Note what in-era does
**not** claim: that this build's version of that zone drops the item.

Reading a Lucy zone name takes its own small vocabulary, because that site decorates a zone name
three ways we don't: an expansion tag (`The Overthere [RoS]`), a revamp version
(`West Freeport 2.0`), and a parenthesised gloss (`Ruins of Old Paineel 2.0 (The Hole)`) — where the
gloss is very often the **only** placeable half. Each is decoration about a copy of the zone rather
than about which zone it is, which is [ADR 0057](./0057-a-grade-is-not-an-identity.md) again in a
third source's handwriting, so every reading is tried and any one placing the zone is enough.

**Cache hard, and cache the misses.** A month for an item (the wiki's week is right for a wiki being
edited and wrong for an archive of a finished expansion), a week for a search — **including an empty
one.** The wiki client deliberately doesn't cache misses; this one must, because it is only ever
asked about names that already failed once, and a player who searches an unknown name twice must not
cost two requests. A page that doesn't parse as an item is *not* cached: it is a bad answer, not a
fact about the item, and the cache would keep it for thirty days.

**Never fetch unasked.** A search is one request. Opening an item is one request. Nothing warms an
index, crawls a list, or resolves the era of results nobody clicked. Every other place Lucy appears
— an item page's card, a search row's era badge — reads the **cache only**, which is what keeps
ordinary navigation free of traffic on someone else's server.

**Be slow on purpose.** `src/shared/polite-queue.ts` serializes every request with a one-second
minimum gap and shares one answer between callers asking the same question at once. Slower than
parallel, which is the point: nothing here is on a path a person waits on without a spinner.

**Get the cookie first.** The obvious handshake — ask, notice the refusal, get a cookie, ask again —
was written first and **does not work**: the cookieless first request caches the refusal under the
URL you wanted, and the retry is served your own poison. So the cookie is fetched up front from
`/?setcookie=1`, the site's own endpoint for it, before any content request is made. No request we
make is ever cookieless, so we never cache a refusal for anyone else either.

**A long source list is a selection, not a truncation.** `Water Flask` has 54 mobs and **362
merchants**; 50 rows are kept. The era verdict is computed over **all** of them first, so a cap can
never turn an in-era item out-of-era; placeable zones are kept ahead of unplaceable ones and drops
ahead of sales, so what survives is what a player here could act on; and the real total is carried on
the item and shown, because a list saying "50 sources" while hiding 366 is a lie of omission.

**On by default, with a switch.** `settings.askLucy` defaults **on** — it is a data source like the
wiki, not an exposure like `connectPeers`, and a supplementary source nobody switches on is a feature
nobody has. Off means *this app makes no request to lucy.allakhazam.com*, which is why the gate is at
the IPC boundary rather than inside the client: that is a promise a boundary can keep.

Rejected alternatives:

- **Resolving the era of every search hit.** It would need one page fetch per hit — a dozen requests
  per query, on the one query shape that is by definition a miss. Opening a hit fetches and caches
  it, so the answer fills in as you look at things and a repeated search is already judged.
- **Guessing era from the item id, or from `reqlevel`.** Both are available and both are wrong: EQ's
  item ids are not ordered by expansion in any way we could defend, and a level-1 item can be from
  the newest expansion in the game. A cheap guess dressed as a filter is worse than "unknown".
- **Folding Lucy's loot lists into `drop-truth.ts`.** That module reconciles the wiki's claims with
  your own kills, and its output is a *rate*. Feeding a third game's drop table into arithmetic
  measured on this server would corrupt the one number the app can honestly call its own. Lucy's rows
  are quotes; they are rendered as quotes, in their own block, and reach no rate.
- **Showing Lucy's card beside eqlwiki's whenever both exist.** Where the wiki has a card, its card
  is the answer, and a second one from a later game is noise. Lucy fills gaps — a card-less stub page,
  or a name with no page at all — which is the whole job of a third-rung source.
- **Treating Lucy as an equal and showing disagreements**, as ADR 0025 does for the wiki. That works
  when both sources describe the same game. These don't, so a disagreement between them is not
  evidence about anything — it is the expected consequence of asking about two games.
- **Scraping `itemraw.html` for the full 300-column dump.** Richer (bitmasks, `reqlevel`,
  `tradeskills`, the real game item id) and 33 KB a page against 11 KB, for fields nothing in the app
  reads. If something ever wants them, that page is where to go back to.
- **Vendoring or pre-baking Lucy's catalogue.** Hundreds of thousands of items, almost none of them
  reachable here, and the thing that makes it useful is arbitrary lookup rather than coverage.

## Consequences
- The app can now answer about an item it has **never seen and no local reference lists** — including
  what the item *is*, which neither eqlwiki-silence nor a loot ledger can supply.
- **"Sold by" is a new kind of answer for a shopping list**, and arguably the best thing Lucy brings:
  the most useful reply to "where do I get one" is sometimes "don't kill anything, go and buy it".
  Parsed as `kind: "vendor"`, so the list and the panels colour it as such with no new code.
- Era filtering on this source is **weaker than eqlwiki's, and visibly so.** eqlwiki states an era;
  this infers one, sometimes can't, and admits it. Most search rows read "era ?" until opened. That is
  the honest shape of the answer, and it is the cost of a source that carries no era field.
- The verdict **corrects itself for free** when an era opens: it is derived from the shipped
  gazetteer, so adding Kunark's zones there reclassifies every cached Lucy item on the next parse —
  which is what `CACHE_VERSION` is for.
- **Two more ways to be wrong, both bounded.** Zone placing runs with one-edit typo tolerance, so a
  modern zone spelled a keystroke from a classic one would read as in-era; and "in era" never meant
  "obtainable" in the first place. Both err towards *showing* something questionable rather than
  hiding something real, which is the right direction for a source whose heading already says it is
  about another game.
- **The parser is coupled to hand-written HTML from about 2004** and will break if Lucy is ever
  rebuilt. Isolated and fixture-pinned like the wiki's (`fixtures/lucy/`, `electron/tests/lucy-parse.test.ts`),
  and it fails to `null` rather than caching a nameless item.
- **A shared CDN cache we don't control can still refuse us**, if someone else's cookieless client
  poisons a URL. It resolves itself when the entry expires; the client reports it and falls back to
  whatever it has cached. We no longer contribute to the problem.
- `polite-queue.ts` and `html-text.ts` came out of this and are **shared**: the queue is the shape any
  future borrowed source wants, and the HTML-to-lines reader now serves both scrapers rather than being
  copied into the second one.
- The **setup check doesn't test Lucy yet.** eqlwiki has a reachability step and this doesn't, so
  "search found nothing" and "Lucy is down" read the same in the one place built to tell them apart.
  Recorded in [todo.md](../todo.md).

## See also
[lucy-data](../lucy-data/README.md) · [wiki-data](../wiki-data/README.md) ·
[ADR 0003](./0003-eqlwiki-runtime-data-source.md) · [ADR 0025](./0025-observation-over-the-wiki.md) ·
[ADR 0103](./0103-search-can-answer-from-your-own-log.md) ·
[ADR 0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md)
