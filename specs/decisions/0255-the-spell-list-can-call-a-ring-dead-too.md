# 0255: The spell list can call a ring dead too

## Status
Accepted

## Context
[ADR 0114](./0114-a-conveyance-the-map-calls-dead-is-not-one.md) taught the graph that a marker isn't
always live: a mapmaker sometimes labels a ring `Abandoned` or a spire `Broken`, and those words are
refused before they're read as anything. But a marker can be just as dead with none of those words on
it — the mapmaker drew a real, working-looking `Druid Ring` and a `Wizard Spire` on South Karana's map,
and no spell in the game casts to either. The ring and the spire are exactly as confident and exactly as
wrong as Greater Faydark's abandoned one — the graph just had no way to tell, because the label itself
says nothing is wrong.

[travel/README](../travel/README.md) already carries a non-responsibility for a related but different
question: "nothing here knows which port spells **you** actually have" — that's unknowable, a fact about
a player's spellbook the app has no way to see. This is narrower and *is* knowable: not "can this player
cast it" but "does any such spell exist in this game at all." A druid ring's whole network is wired on
the premise that every marked ring is reachable by *some* spell
([ADR 0066](./0066-a-port-is-cast-from-where-you-stand.md)); when no such spell exists for a given zone,
the premise is false regardless of who's asking.

**The evidence was already sitting in the app.** `spell-harvest.json` — eqlwiki's spell roster, fetched
for the Spells tab ([ADR 0195](./0195-a-spell-catalog-trusts-the-wikis-own-numbers.md)) — names every
spell in the game, and each cached page states its destination in plain English on its own card.

**The first pass at this got it wrong, and the wrongness is the actual lesson.** It checked only the two
most obvious families — a druid's `Circle of X` and a wizard's `X Portal` / `Translocate: X` — found
South Karana silent in both, and *also* called East Karana's ring and South Ro's spire dead on the same
evidence. Both of those were mistakes, caught by someone who searched the wiki directly instead of
trusting the two families guessed at: **`Succor: East Karana`** is a real level-26 druid spell
(`"transports your group to the Eastern Plains of Karana"`), and **`Evacuate: South Ro`** is a real
level-38 wizard one — its own card even documents a fixed bug about *which* spot in South Ro it used to
drop you at, which only makes sense if the spire it targets is real. A druid's "get to X" spell turns out
to be **four separate ranks** — `Circle`, `Ring`, `Succor`, `Zephyr`, each its own level, cast time and
target type (self/group/single) — and a wizard's is four deep too — `Portal`, `Gate`, `Translocate`,
`Evacuate`. Checking two of eight families and generalising "no spell" from that is exactly the kind of
guess this subsystem exists to refuse.

**Checked again, against all eight families, over the full roster** (searching the spell corpus for every
name mentioning each zone, not just the two patterns first guessed at):

- **North Karana** — all eight: `Circle`, `Ring`, `Succor`, `Zephyr` of North Karana (druid); `North
  Karana Portal`/`Gate`, `Translocate: North Karana`, `Evacuate: North Karana` (wizard).
- **East Karana** — only `Succor: East Karana` (druid). No wizard spell, but no wizard spire is marked
  here either, so nothing to drop on that side.
- **West Karana** — only the wizard four (`West Karana Portal`/`Gate`, `Translocate: West Karana`,
  `Evacuate: West Karana`). No druid ring is marked here either.
- **South Karana** — **none of the eight**, for either class. Not a single spell in the entire corpus
  names South Karana. Both networks are dead here.
- **North Ro** — the wizard four, all under the bare name `Ro` (`Ro Portal`/`Gate`,
  `Translocate: Ro`) plus one that says its target zone outright rather than "Ro" (`North Ro Portal`).
- **South Ro** — the druid four, twice over (`Circle of Ro` **and** `Circle of South Ro`, `Ring of Ro`,
  `Succor: Ro` and `Succor: South Ro`, `Zephyr: South Ro`) *and* the wizard `Evacuate` (`Evacuate: Ro`
  **and** `Evacuate: South Ro` — the bare-named `Ro` spells split inconsistently by class, which is
  exactly why this is read off each card rather than assumed from the name). Both networks are real.
- **Nektulos Forest** — the wizard four (`Nektulos Portal`/`Gate`, `Translocate: Nektulos`,
  `Evacuate: Nektulos`). **No druid spell of any of the four ranks.** The ring is dead; the spire is real.

So the corrected list is **South Karana (both networks) and Nektulos Forest (druid ring only)** — two
zones, three drops, not the four originally claimed.

Five further zone files this pack draws a ring or spire on — `commonlands`, `lavastorm_original`,
`nektulos_1_original`, `eastkorlach`, `frontiermtnsb` — don't resolve to a zone the app's own catalogue
recognises by name at all (`zoneNames` falls back to prettifying the raw file), which is the same shape
as the stale/duplicate drawings [ADR 0174](./0174-the-era-decides-which-drawing-is-the-zone.md) already
found elsewhere in this pack. Whether their markers are real, duplicates of a zone already covered, or
neither, is a zone-identity question, not a spell-list one, and guessing it here would be exactly the
kind of invented half [ADR 0048](./0048-a-map-label-is-read-by-its-words.md) refuses. Left as an open
item in [todo.md](../todo.md) instead.

## Decision
**Cross-reference a hub member against every family in the game's own spell corpus, and drop the ones no
spell of any rank reaches.**

`manual-links.ts`'s `drop` list has existed since the manual pass was built — "a ring the maps label
that doesn't work" — but had never been given an entry. It's the exact mechanism this needs: it removes
only the hub edge, so the node stays on the map as the real place it is, and a route falls back to the
next best way there instead of a confident, uncastable port. The two zones above are written there, each
citing the specific ranks checked and the specific absence found, in the same evidentiary shape as every
other line in that file.

This is **hand-checked, not automatic**, for the same reason ADR 0080 stopped short of the spell file's
effects blob: there is no naming convention robust enough to join a ring's zone to a spell's target by
pattern. `Circle of the Combines` doesn't go to a zone called "the Combines" at all — its card names the
Dreadlands. `Circle of Commons` and `Circle of West Commons` both mean Western Commonlands, and the bare
`Ro` spells go to *different* zones depending on which class casts them (a druid's to South Ro, a
wizard's to North Ro) — nothing in any of these names says so without reading the card. A person reading
the wiki's own words is the same bar [ADR 0117](./0117-the-wiki-says-which-zones-touch.md) already holds
the wiki to elsewhere in this subsystem — **and it has to be every rank**, not the first or the most
familiar, which is the exact corner this decision cut once already.

**Precedence, stated once more:** a map's own dead-conveyance wording (0114) is checked first, at
harvest time, because it's a fact about the label. This is checked second, by hand, because it's a fact
about the game that no label states one way or the other — a marker neither vocabulary flags is *not*
proven live, only unproven dead, and stays live until someone reads its spell and finds otherwise.

## Consequences
- A druid or wizard is no longer routed to South Karana's ring or spire, or Nektulos's ring, as a free
  ride. East Karana's ring and South Ro's spire stay in the network — the corrected finding — alongside
  every other zone this pass checked and found real.
- The travel graph's non-responsibility about port spells is now two separate claims rather than one:
  *whether a real spell exists for a zone* is checked here, by hand, against the wiki's own corpus;
  *whether the asking player personally has it* remains unknowable and stays a manual `avoid`
  ([ADR 0109](./0109-a-route-can-be-denied-one-place.md)).
- **Not a general rule**, on purpose, and so it will not catch the next pack's next mislabelled ring by
  itself — exactly the risk ADR 0114 accepted for its own four zones "nobody has confirmed." Worth
  automating the day someone is willing to read the spell file's effects blob for a teleport's target
  zone/coordinates (a scalar fact, not a damage formula — narrower than what ADR 0080 declined), which
  would let every ring and spire be checked this way without a person reading each wiki card by hand —
  and would also close off the exact mistake this ADR made on its first pass, where a person checked two
  families and stopped.
- The five unresolved zone files stay in the graph exactly as they were — this decision changes nothing
  about them, and says so in `todo.md` rather than silently leaving the question unasked.

Rejected: **trusting the marker whenever the label isn't explicitly dead** (the status quo, and the bug
this fixes — South Karana's ring says nothing is wrong with it and nothing about the label ever will);
**deriving a spell's target from its name** (wrong for `Circle of the Combines`, ambiguous for `Circle of
Ro`/`Circle of Commons`, and actively misleading for the bare `Ro` spells, which is exactly why each
entry here cites the card, not the name); **checking only the most familiar family per class** (the
mistake this ADR itself made on its first pass, corrected above); and **reading the spell file's effects
blob to find every teleport automatically**, which is real design work ADR 0080 didn't take on and this
doesn't either — noted above as the natural next step, not done here.
