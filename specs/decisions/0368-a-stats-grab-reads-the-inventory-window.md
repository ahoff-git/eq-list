# 0368: A stats grab reads the Inventory window

## Status

Accepted

## Context

[ADR 0366](./0366-a-loadout-floor-is-in-the-games-own-numbers.md) made a floor mean what the game's Inventory window
shows, and asked the player to *type* those figures for HP, mana, AC and endurance. Attributes and resists couldn't be
calibrated at all, so a floor on INT needed a ticked race and one on a resist counted gear only. The player asked
(2026-11-08) for the app to read a screenshot of the stats page instead, and — once the Ctrl+Shift+L grab was
named as the starting point — said it doesn't handle that page well, and asked for a **new shortcut that fires the
same capture but routes it to a special stats parser**.

The item grab can't be stretched to it. It reads the crop as one block of text and corrects item-name confusions
([ADR 0081](./0081-an-ocr-grab-is-corrected-before-it-is-searched.md)); the stats page is two columns of labels and
numbers. The page itself was settled from the game's own UI files (`uifiles/<skin>/EQUI_InventoryWindow.xml`, the
`IWS_*` labels) and checked against two real screenshots (a level-31 WIZ/DRU/MAG, two scroll positions): rows of
`Label  cur/max`, with HP, Mana and End as `cur/max`, AC as `mitigation/softcap | evasion`, the seven attributes as
`cur/510 + heroic`, and the six resists (`SV. Magic` … `SV. Void`) as `cur/1000`. Skins word it alike (`End` or
`Endurance`, `SV. Magic` or `Magic`).

This revisits a door [ADR 0018](./0018-inferred-max-hit-points.md) shut: it ruled out OCR of the *health bar* —
a continuous read of a live gauge, needing a calibration per UI layout and a capture that might come back empty in
fullscreen. This is none of those. It is a single snapshot the player takes on purpose and aims at the page, parsed
by the labels it finds rather than by where a layout puts them, and the screen capture under it has shipped since
[ADR 0081](./0081-an-ocr-grab-is-corrected-before-it-is-searched.md) and [ADR 0102](./0102-a-lookup-never-holds-the-screen.md).
A figure read this way is the "figure the player states outright" that ADR 0018 already lets win over the log's bounds.

Replaying those screenshots through Tesseract showed what goes wrong. Labels and numbers pair badly when read line
by line (a label with no number sits beside one with, in the other column). Plain luminance loses red digits — a
debuffed SV. Fire 19 read as "11000". And the font's `/` is a thin stroke that comes back as a **`1`** or nothing:
`242/368` became `2421368`, worst on the dim grey rows. No amount of preparing the pixels fixed that on its own — the
best variant got it right on one row and wrong on another, and varied run to run.

## Decision

- **A second hotkey, Ctrl/Cmd+Shift+K, and a "Read my stats" button open the same grab for a different purpose.** One
  frozen screen, one selector per monitor, one drag; the deadlines of [ADR 0102](./0102-a-lookup-never-holds-the-screen.md)
  are unchanged. A `GrabPurpose` (`item` | `stats`) says where the crop goes — Search, as before, or the stats reader — and
  the selector says which it is.
- **The page is read by geometry, not by line.** The words come back with their boxes (sparse-text mode), rows are
  rebuilt from their vertical centres, and a row is cut into segments of a label and the values after it, so a label
  with no number can't swallow its neighbour. A label is matched against the game's wording exactly and, for the long
  names only, within an edit or two. What the heroic `+ N` adds is not the stat. A pool is its **max** (the current dips
  in a fight); an attribute, a resist and AC are their current/mitigation figure.
- **The pixels are made dark-on-light by the brightest channel**, so a saturated colour counts as lit, with the
  polarity taken from the panel (a light skin stays dark-on-pale). Enlarged threefold, in two tones: `soft` keeps the
  anti-aliasing, `strict` thickens a dim stroke into a solid one.
- **A lost `/` is repaired by structure, and the read says so.** A fused run of digits is split where the stat can
  be split: a pool's max is at least its current and normally equal to it; an attribute's or resist's max is the cap
  every other row shows (the page's own, or 510 and 1000 when none read cleanly). AC's softcap is anything, so its split is only ever a guess. A repair
  anchored by structure is *certain*; one resting on nothing, or on a word the recogniser was unsure of, is **doubtful**.
  A spent pool has no equal halves (`555/2924` → `55512924`), so its lost slash is guessed — a `1` standing where it
  was, when there is exactly one place it could be, and only from a run too long to be a single figure. An
  attribute a drag clipped to a lone `214` is *not* split into 2 and 4: that would turn a right answer into a wrong one.
  Re-reading one fused cell on its own, enlarged and as a single line, was tried and **rejected**: the same cell came
  back `555/2924`, `5551/2924` or `55572924` depending on the zoom, and cells that had read cleanly (`946/2034`)
  came back wrong. The second preparation is a second opinion, run only when something was repaired — a page that read cleanly never
  pays for it — and the cleanest read of each stat wins, the recogniser's confidence breaking a tie.
- **A doubtful figure is shown, never applied.** The notice names it with the guess ("Not sure of AC (242?)") and lists
  rows that weren't in the box; `confidentValues` is all the planner uses.
- **Calibration widens to everything the page shows.** Attributes and resists join the four pools, by the same offset
  from what the plan counts ([ADR 0366](./0366-a-loadout-floor-is-in-the-games-own-numbers.md)); a read **zero is a
  figure**, where an empty typed box is a blank. The read waits in a small window-level store, the Items tab opens on
  the loadout builder, and the builder applies it where what you wear can be measured; with no inventory dump it says
  the read is waiting. `goalsWithoutBase` no longer asks for a race on an attribute the game's figure is known for, and
  never asks for one on a resist.

## Consequences

- On the first two real screenshots the pipeline read all 17 figures right from a tight drag, a loose one, a drag
  clipping the first and last rows, and the whole window; a crop of half the page reported the rest as missing. A
  third, taken at level 32 and *damaged* (HP 946/2034, mana 555/2924), read HP as its max — and its spent mana as a
  flagged guess, correct but not applied, because the lost slash has nothing to anchor it. Varied from
  those: a light skin, a UI scale of 125–200%, dim and washed-out images were all read right; 70% and a heavy blur
  lose figures (reported missing, not guessed); under heavy noise the soft preparation alone inserts a stray digit into
  AC (2,427 for 242) — flagged doubtful, so not applied. Real OCR words from these are fixtures in `stats-page.test.ts`.
- The evidence is one skin at one UI scale from one player. The other skins are covered by their XML's wording and by
  synthetic rows, not by their pixels; a figure that is wrong *and not flagged* is the bug to bring back, with the
  debug log's `stats pass` lines.
- AC is the page's mitigation figure. The planner counts item AC plus AGI's, and mitigation bends at the softcap
  shown beside it, so the offset is exact only for the gear worn when it was read.
- Calibrated attributes don't feed the pools' rates, which still take their AGI/INT bands from the race table; the
  pools' own offsets absorb the difference.
- The window's header — level and classes (`31 WIZ/DRU/MAG`) — is on screen in the same crop but isn't read, so the
  planner's rates still use the Items tab's level cap, not the character's level.
- It reads what is on screen: rows scrolled out of the box are missing, and calibration is per stat, so a second
  grab fills in the rest. The first read downloads the OCR model, as the first item lookup does. `Ocr` reads one at a
  time, because the worker's segmentation mode is state and the stats read changes it.
