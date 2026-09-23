# 0265: Named spawns mark themselves on the map

## Status

Accepted

## Context

The map already places one kind of mark by itself: **Hunt pins**
([ADR 0142](./0142-a-hunted-mob-marks-itself.md)) show a mob your shopping list wants, ranked by
whichever source can place it — your kills, peers' kills, or the wiki's stated `Location:`
([mob-place.ts](../../src/shared/map/mob-place.ts)). That's scoped to the hunt list on purpose, and
it leaves a real gap: a player wants to see where *every* notable spawn in the zone on screen is,
whether or not it happens to drop something they're after.

The map's own "Named & bosses" label filter (`src/shared/map/poi-kinds.ts`) looks like it should
answer this, but it only draws whatever a *community map pack* happened to hand-label — visual,
pack-dependent, and not a queryable dataset at all.

We looked for a cleaner source of truth and found eqlwiki.com has no `Category:Rare`. It does have
`Category:Named Mobs` — verified live, 6,586 members — but it is a **spawn-mechanics** category (a
spawn slot that competes with an ordinary placeholder), not a promise that every member has a
unique proper name. `A bandit (Eastern Karana)` is a member. The player asked for this anyway,
told of that caveat, over a narrower own-observation-only design (waiting for the log's own
`- a rare creature -` consider annotation, which [ADR 0269](./0269-a-pet-is-not-a-named-and-a-rare-creature-says-so.md)
already parses but deliberately never acted on) — coverage from day one won out over precision.

## Decision

**Every mob eqlwiki's `Category:Named Mobs` knows about, in the zone on screen, marks itself the
same way a hunt pin does — regardless of the hunt list.**

- **The category list is generated, static data**, following the same shape ADR 0262-0264 already
  established for a wiki list that changes by someone's edit, not by a formula:
  `scripts/fetch-named-mobs.mjs` walks the category (`categoryMembers`, already generic and
  paginating) and writes `src/shared/named-mobs.generated.ts`. `src/shared/named-mobs.ts` is the
  hand-written lookup beside it, `isNamedMob(name)`, folding a title through **both** of the app's
  existing name normalizations rather than inventing a third: `npcKey` (drops a trailing
  disambiguating parenthetical — the category itself carries one, `A bandit (Eastern Karana)`) and
  `stripArticle` (drops a leading article a kill log or a zone roster carries and a wiki title
  never does).
- **"Which mobs are in this zone" comes from the zone's own wiki page, not a scan of thousands of
  mob pages.** A zone page already carries a parsed NPC roster (`WikiPage.npcs`, ADR 0163), fetched
  through the same `getPage` IPC call as any other title — no new Electron/IPC code at all. Where a
  named roster entry has never been killed, its own page's `Location:` is asked for the same
  bounded way a hunt pin's unplaced mobs are (`unplacedNamedMobs`/`useMobWikiPlaces`).
  Where the roster is missing or stale, a named mob you've actually killed here still shows —
  candidates are the *union* of the roster and anything `isNamedMob` in your own or pooled kills,
  never the roster alone.
- **`src/shared/map/named-pins.ts`** mirrors `hunt-pins.ts` closely (`namedPins`,
  `unplacedNamedMobs`) and reuses `mobPlace()` unchanged: your kills > pooled/peers' kills > the
  wiki. **It deliberately skips `hunt-pins.ts`'s `statedHere()` zone-match gate** — a roster name is
  already known to be about *this* zone because it came from this zone's own page, unlike a hunted
  mob whose wiki page might be filed under a different zone than the one on screen. The accepted
  cost: a multi-zone/instanced named mob's own `Location:` line could describe a different instance
  than the one being viewed; the wiki-sourced half of `mobPlace()` already carries that class of
  imprecision everywhere else it's used.
- **A mob already drawn isn't drawn twice.** `namedPins` takes the same `placed` coordinate list
  `huntPins` does, and the map window passes it both hand-placed pins *and* the hunt marks just
  computed — a mob that's both hunted and named reads as one mark, not two.
- **`MapPanel.tsx` needed no changes.** Hunt pins already proved the generic `RenderPin` shape
  (`mob?`, `loud?`, `spread?`) gets hit-testing, rings (solid measured / dashed stated), captions,
  and click-to-open-the-📖-panel for free; a named pin is drawn through the same shape with its own
  color/glyph (`NAMED_PIN`, `src/shared/map/pins.ts`) so the two read apart at a glance.
- **A toggle beside "Hunt"** in the 👁 panel (`showNamedPins`, `STORAGE_KEYS.mapNamedPins`),
  defaulting on and persisted for the same reason `showHuntPins` is: "don't put things on my map"
  is a standing answer, not a per-session filter. Its hover states the broad-category caveat
  outright, since a reader shouldn't have to find this ADR to learn it.

## Consequences

A zone the player has never hunted anything in can still show its named mobs, the moment the
zone's own wiki page (or a kill) says so. Coverage grows the same way the rest of the wiki-backed
map does — as pages get fetched, not all at once — and a zone with no cached page yet, or one that
isn't a real eqlwiki zone page under the map's resolved name, simply shows nothing extra rather
than erroring: the same graceful-empty behavior every other wiki-backed panel already has.

Because the source category is broad, the layer will show some thoroughly ordinary camp mobs
alongside genuine rares — a known, named tradeoff, not a bug. Narrowing it further (the log's own
`- a rare creature -` annotation, still sitting unused since ADR 0269) is a real follow-up if the
noise turns out to matter in practice, but it's a different, additive decision, not one this ADR
needs to make now.

## See also
[ADR 0142](./0142-a-hunted-mob-marks-itself.md) ·
[ADR 0269](./0269-a-pet-is-not-a-named-and-a-rare-creature-says-so.md) ·
[ADR 0163](./0163-an-item-wears-the-level-of-what-drops-it.md) ·
[ADR 0025](./0025-observation-over-the-wiki.md) ·
[ADR 0262](./0262-stances-and-invocations-are-generated-static-data.md) ·
[ADR 0263](./0263-the-alternate-advancement-page-is-generated-static-data.md) ·
[ADR 0264](./0264-buff-line-data-is-generated-static-data.md)
