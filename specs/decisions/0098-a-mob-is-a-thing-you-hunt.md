# 0098: A mob is a thing you hunt, not a thing that drops

## Status

Accepted

## Context

The shopping list holds **items**: things with a name a loot line can match, a count you need and a
count you have. Everything downstream assumes that — `applyLoot` matches every entry's name against
every loot line, the Hunt tab inverts entries into "where does this drop", and the row shows
`3 of 5`.

A mob is none of those things, and "+ Add" on a mob page had already been through one repair.
[ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md)-era `wiki-add.ts` fixed the worst of
it — the search results used to add any non-quest page as an item, so a named landed on the list as
something to loot — by ruling that a mob is a **source**, and adding its loot table instead.

That is still the wrong answer, for a reason the spawn-timer work made obvious: a named is a thing
you go and **kill**. Someone adding *Ghoul Lord* to their list wants Ghoul Lord on their list. What
they got was either a dozen item rows they didn't ask for (a mob page keeps its known drops in
`components`), or — where the wiki lists no loot — nothing at all, silently.

So the list could express "the twelve things this mob drops" and could not express "this mob".

## Decision

**A list entry has a `kind`, and `mob` is one of them.** Absent means `item`, which is every entry
ever written, so nothing on disk changes meaning.

**A mob adds itself.** `wikiAddAction` returns `self` for a mob page whether or not its loot is
known, because what's being added is the mob rather than its table. Its drops are not added: if you
want one you can add it, and the mob's page still lists them.

**A mob is excluded from loot matching, by kind rather than by luck.** `applyLoot` skips it — a mob
is what you loot *from*, and left in, "Ghoul Lord" would be credited by the Ghoul Lord's Cape it
dropped, under the substring match the default mode uses.

**A mob is never an outstanding item.** `neededEntries` filters it out, or it would sit there for
ever as a pending row that nothing could satisfy, quietly inflating every "what's left" count.

**On the Hunt list it is a target, placed by your own kills.** `HuntTarget` carries the mob and the
zones you have actually killed it in — because a mob's wiki page has **no sources at all**
(`parseWikiPage` builds one with `sources: []`), so where a named lives is a question only
observation can answer here. That is [ADR 0025](./0025-observation-over-the-wiki.md) arriving at the
same conclusion from the other side: not "observation corrects the wiki" but "the wiki never knew".
A mob you have never killed is listed under an unknown zone rather than dropped, because *on your
list, home unknown* is more useful than absent.

**A target leads its zone, and counts as a reason to go there.** You named it explicitly, which
outranks any number of things that merely drop from something else — and a zone whose only draw is
that named must not sort below one that happens to drop two things you need.

Rejected alternatives:

- **A separate "hunt list" store.** Two lists to keep, two things to share, two places to look. The
  entry already has an origin, a note and a wiki path; it needed a kind, not a sibling.
- **Keeping the drops as well.** Considered and put to the user: adding one named would still dump
  its loot table on the list, which is the complaint rather than a compromise.
- **Reading a mob's zone from its wiki page.** There is nothing to read — the card is unstructured
  prose lines, and mining "Zone: X" out of it would be a parser that fails silently the first time
  the page is edited.

## Consequences

- The list is now two kinds of thing, and every consumer has to know which it is holding. Three do
  (`applyLoot`, `neededEntries`, the row), and the type makes the question askable rather than
  leaving it to a name that happens not to match a loot line.
- A mob row shows no count and no ± buttons, because there is no progress to display. It says
  **hunt** instead. A mob is never "done", so it is never struck through.
- The Hunt tab gains rows with no items under them, which is a shape it could not previously
  produce — `itemCount` had to start counting a target as a reason, or a target-only zone would sort
  to the bottom of the page it exists to be at the top of.
- **How many you want to kill isn't modelled.** `needed`/`obtained` are meaningless for a mob and
  are left alone rather than repurposed; the kill log already counts kills, and wiring that in is a
  separate question from getting the mob onto the list at all.
- This pairs with the spawn timers: the nameds you add here are the ones you camp, and the ones you
  camp are the ones you want timed
  ([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)). Nothing links the two
  lists yet — adding a mob doesn't start a timer, and timing one doesn't list it — which is the
  obvious next join and deliberately not made here.
