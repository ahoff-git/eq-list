# 0204: A contribution back to the wiki is yours alone

## Status

Accepted

## Context

[ADR 0025](./0025-observation-over-the-wiki.md) points the whole app one way: the wiki describes an
older build, your own kills are this server and this build, and observation wins on screen once
there's enough of it. Nothing before this let that knowledge flow the other direction. EQBuddy's
`WikiContribution.cs` does — it formats a player's own observations as MediaWiki markup meant to be
pasted straight into an eqlwiki edit — and the gap here was real: `drop-truth.ts`'s `reconcileDrops`
already names exactly which of your drops the wiki has never heard of (`verdict: "undocumented"`,
"the most valuable row on the screen"), and until now that fact only ever reached a screen.

Two things had to be settled before writing a formatter, not assumed:

**What does the wiki's own markup actually look like?** This app has only ever read *rendered* HTML
(`action=parse`), never raw wikitext, so `electron/wiki/parse.ts` has no model of the underlying
template syntax at all. Fetching two real pages' raw wikitext (`action=parse&prop=wikitext`) settled
it: a mob's `known_loot` parameter is a plain `<ul><li>` list, each item either a bare `{{:Item Name}}`
transclusion or one with two more spans — `<span class='drare'>(Rare)</span>` (a rarity **word**) and
`<span class='ddb'>[3] 1x 35% (20%)</span>` (a numbered box tying into drop-table bookkeeping this app
has no way to read or correctly assign). The transclusion syntax is real and safe to reuse; the
numbered box is not something a contribution should ever fabricate.

**Whose kills does a contribution speak for?** `MobKnowledge` is pooled — `myKills` sits beside
`kills`, `MobDrop.myCount` beside `count`, exactly so a figure about *your* kills never has to borrow
a peer's ([ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md) draws the identical line for
knowledge pooled with peers). A wiki contribution is signed with a character's name; it has to be a
claim that character can actually stand behind.

## Decision

**`buildWikiContribution` (`src/shared/wiki-contribution.ts`) reads only what `reconcileDrops`
already computes, scoped to your own counts, and stops well short of the wiki's own template.**

- **Reuses `{{:Item Name}}`**, verified real, for a suggested new loot-list line — the one piece of
  the wiki's own syntax that's both understood and safe to emit unattended.
- **Never emits a `drare` rarity word or a `.ddb` box.** Assigning either would mean guessing at a
  convention this app hasn't earned the right to guess at; the raw count and percentage are stated in
  plain English instead, and the human reading it decides how it fits the existing table.
  EQBuddy's own header states the same restraint: observations are "suggestions for reconciliation,
  never paste-over instructions for existing prose."
- **Two sections, each only when non-empty**: drops the page has never listed (`undocumented`, the
  headline case), and drops the page lists that a large enough sample of your own kills hasn't
  produced (`suspicious`) — worth a second look, not asserted as wrong. A kill count that matches the
  page exactly says so in one line rather than two empty headings.
- **Built from `MobDrop.myCount`/`MobKnowledge.myKills` only.** A zone pooled with peers never lets a
  peer's count into the total; the whole point of the pooled/`my*` split existing is that this
  function can read the second half and ignore the first.
- **No new outbound path.** This produces text for the clipboard, the same mechanism `DamagePanel`'s
  fight summary and `CastWatchRow`'s share code already use (`src/lib/clipboard.ts`'s `copyText`) —
  there is still no `action=edit`, no credential, no request this app makes to eqlwiki on the
  player's behalf. Reaching the actual edit box stays the player's own trip through
  `wiki.openInBrowser`'s existing host-allowlisted channel ([ADR 0008](./0008-in-app-page-navigation.md)).
- **Lives on `MobKills.tsx`**, next to the "Your kills" heading it already draws from the same data —
  a "Copy for wiki" button beside the same `useMobZones` call, gated the same way the rest of that
  block is (nothing to copy before there's a kill to report).

## Consequences

A player who's found something eqlwiki doesn't know about now has a one-click way to say so in words
a wiki editor will recognise, without this app ever writing to the wiki itself or claiming to know a
template convention it was never shown. The generated text is explicit that it's a suggestion, not
finished prose, which is the same posture ADR 0025 already takes toward the wiki in the other
direction.

**The `.ddb`/rarity gap is a deliberate, stated limit, not an oversight.** If eqlwiki's own citation
convention is ever worth reproducing exactly, that needs a real look at how those numbered references
are assigned across a page — a bigger question than this feature answers, and one a contribution
generator should not quietly guess at in the meantime.
