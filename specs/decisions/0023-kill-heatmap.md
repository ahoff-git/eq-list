# 0023: The kill heatmap — show the doubt, share the conclusion

## Status
Accepted

## Context
[ADR 0022](./0022-invocation-effects-and-kill-locations.md) started recording where kills
happened, with a confidence score, because EQ only reports a position when the player types
`/loc`. Recording it was the easy half. The hard half is a display problem: a dot on a map
looks like a fact. Plotting an inferred position the same way as a measured one is worse than
not plotting it, because the map stops being able to lie *visibly*.

The scale of the doubt, from a real log: **132 kills, 58 with any position at all, exactly one
worth believing.** Five `/loc` lines in 6,240. A heatmap built from that without qualification
would be fiction.

## Decision
**Confidence is part of the marker, not a footnote.** `src/shared/kill-confidence.ts` owns one
ladder — measured / close / approximate / guess / unplaced — with a glyph, a colour and a
plain-language reason each. The map draws the glyph and fades and shrinks the dot by
confidence; the kill list shows the same glyph on the same scale. One vocabulary, so a faint
dot and its row can't tell different stories.

- **Glyph *and* colour**, never colour alone: it has to read on a busy map and for
  colour-blind players.
- **Below "approximate" nothing is plotted.** Those kills stay in the list, labelled — the
  record is kept, the false precision isn't.
- **Right-clicking a marker turns the markers off**, and there's a Settings toggle. The
  fastest way to dismiss something you've stopped needing is on the thing itself; the setting
  is how you get it back.

**One filter object, one filter function** (`src/shared/kill-filters.ts`), applied to both the
map and the list: time window, mob, what dropped, dropped-anything, and a confidence floor.
A filtered heatmap and the list beside it are the same query — guaranteed by there being only
one implementation.

**Drops are attached to kills at ingestion, not joined at query time.** When a loot line
arrives it's matched to the most recent kill of that corpse (by name, within two minutes) and
appended. That's what makes "only show kills that dropped a Rat Ear" a filter over data we
already have rather than a search across two logs — and it follows
[ADR 0019](./0019-parse-once-and-one-tracker.md): enrich once, at the boundary.

**Sharing sends the conclusion, not the evidence.** A shared kill is `{zone, y, x, mob,
confidence}` — nothing about which `/loc` it came from, how stale it was, or how fast the
player was moving. Peers can't use our evidence and don't need it. It rides the existing
awari room (`AWARI_MSG.kills`, following the shared-pins precedent), is opt-in per player,
and only placeable kills are sent. Peers' kills draw outlined rather than filled, so a pooled
camp heatmap stays legible as *whose*.

Rejected alternatives:
- **A smooth heat gradient.** Prettier, and it blurs exactly the distinction that matters —
  the difference between one measured kill and ten guesses becomes invisible.
- **Plotting everything and letting colour carry the doubt.** Tried in the design: at this
  log's confidence spread the map is a wall of red dots that all look like data.
- **Filtering in each view.** Two implementations of "which kills" is two chances for the map
  and the list to disagree, which is the one thing this feature can't afford.
- **Sharing the raw records.** Bigger payload, other people's `/loc` habits leaking, and no
  use for it at the far end.

## Consequences
- The heatmap is honest by construction, and it will look sparse until `/loc` is sent more
  often — which is the truth about the data, and the argument for the `/loc` nag (still on the
  todo).
- Sharing pools a camp's kills across a group, which is where a heatmap earns its keep: one
  player's five fixes are thin, six players' are a map.
- Confidence is computed once when the kill is recorded, so it reflects what was known *then*.
  A later `/loc` doesn't retroactively improve an existing record; retro-scoring is possible
  (the evidence is stored) but not implemented.
- Drop matching is by corpse name within a window, so two mobs of the same kind dying close
  together can credit the drop to the wrong one. It picks the most recent, which is right far
  more often than not.
- The kill log keeps 5,000 records with ~15 fields each. Generous on purpose: the display can
  be reworked without re-collecting anything.
