# 0175: A lapse is read at a glance and cleared in a column

## Status
Accepted

## Context
Reported from the app, about the two surfaces a lapsed buff appears on
([ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md)):

- **The banner ran ungodly long, and was mostly slashes.** Where the game words several spells' fades
  identically, `narrowCandidates` refuses to guess and hands the whole candidate list on as
  `alsoCouldBe` — the right call, and one the panel row has always printed in full. The *banner* was
  printing it in full too. A spell family with six shared fade sentences turned a one-line warning
  into `RE-CAST! — OR THORNCOAT / BARBCOAT / BLADECOAT / SPIKECOAT / DIAMONDSKIN`, wider than the
  screen it was drawn over, and `.ca-hint` had no width cap to stop it — only `.ca-text` did. The
  spell you were actually being warned about was the part that went off the edge.
- **Clearing a death strip was eight journeys.** The ✕ that stands a reminder down
  ([ADR 0147](./0147-an-overlay-control-takes-its-own-clicks.md)) sat at the end of its row, so its x
  position was wherever that spell's name happened to end. Dying strips everything at once, which is
  exactly when the list is longest and least worth reading one row at a time, and the ✕s formed a
  ragged right edge to chase down.

## Decision
**The banner names one alternative and counts the rest; the ✕ leads the row.**

- Ambiguity is worded in one place, `alternativesLabel` in
  [buff-tracking.ts](../../src/shared/buff-tracking.ts) (pure, tested), with a `cap` on how many
  candidates get named before the remainder becomes `+N more`. The panel row calls it uncapped — it
  has the room and is read at leisure. The banner caps it at **one**: past the first alternative the
  fact worth having mid-fight is *that* the name is uncertain, and a count says that as well as a
  list does. The full list stays one click away on the Buffs tab.
- `.ca-hint` gets the width cap and ellipsis `.ca-text` already had, as the floor under any hint that
  still runs long — a custom `message` included.
- The ✕ moves to the **start** of a `buff-hud` row, at a fixed width. Every row's control is then at
  one x whatever the spells are called, and a row closing brings the next ✕ under the cursor that
  just clicked, so clearing a death strip is *n* clicks in one place. It replaces the row's ⚠ rather
  than joining it: every row on that HUD is a warning, the colour bar already says which look it
  wears, and two leading glyphs of which only one is clickable is a thing to work out mid-fight.

## Consequences
- The banner stays a banner in the case that used to break it, and the spell name is never the part
  that gets truncated.
- One wording function means the two surfaces can't drift into describing the same ambiguity
  differently, and the difference between them is a number at the call site.
- `+N more` is a promise the panel keeps; a player who wants the ranks named has to go and look. That
  is the trade, and it is the right way round — the banner is for the glance.
- Standing down is now the leftmost thing on a reminder rather than the last. It is still the only
  clickable part, and still only reachable while the window has taken its clicks back (ADR 0147).
- Nothing about *which* lapses are announced, or how long they stay true, changes — 0140 and
  [ADR 0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md) stand as written.
