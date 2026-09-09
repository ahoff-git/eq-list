# 0213: Every stock alert claims its own corner

## Status

Accepted

## Context

Every standing board over the game — pinned spawn countdowns (`SpawnOverlay`), a running goal's
progress (`GoalsOverlay`), the buffs you're missing (`BuffOverlay`), the debuffs you're holding on an
enemy (`DebuffOverlay`) — and every banner (`CastAlerts`) resolve their on-screen spot the same way:
`alertStyle`'s `position`, laid out by the six preset corners `alertPlacement`/`.overlay-at` knows
([ADR 0099](./0099-a-countdown-can-stay-on-screen.md)). `ALERT_SOURCES` (`alert-styles.ts`) ships six
stock looks — record, spawn, loot, buff, goal, achievement — but only ever used three of the six
corners between them, so most doubled up:

- `SPAWN_STYLE_ID` and `GOAL_STYLE_ID` both shipped `top-right`. Both are *standing boards*, each its
  own independent `position: fixed` element — camping a named while running a farming goal put both
  boxes on the exact same pixels the moment both were on screen, which out of the box is often.
- `LOOT_STYLE_ID` also shipped `top-right`, briefly drawing its banner over that same pinned countdown
  list every time something on the shopping list dropped.
- `RECORD_STYLE_ID` and `ACHIEVEMENT_STYLE_ID` both ship `top` — harmless, because every banner,
  whatever raised it, is rendered by the one `CastAlerts` component into one shared per-position
  stack. Two banner *kinds* sharing a corner just means two rows in the same column.
- `DebuffOverlay` has no built-in look of its own to collide *with* — a debuff is not a feature the
  player configures separately, it's the very same `KnownBuff` row `BuffOverlay` reads, seen on an
  enemy instead of on you, so an unstyled one falls back to `BUFF_STYLE_ID` exactly as an unstyled buff
  does. That fallback carried `top-left`, so a crowd-control class's two standing boards — what's
  missing on you, and what's holding on the mob — landed on the same pixels too.

The pattern that actually matters, then, is not "two things share a corner" (safe when both are
banners in one component) but "two *independent, standing* elements share a corner" (never safe,
since nothing coordinates their layout beyond the literal CSS position).

## Decision

**Give every source that can be a standing board its own corner**, and leave banner-only sources free
to share `top` with each other, since `CastAlerts` already stacks same-position banners correctly
regardless of which kind raised them.

- `SPAWN_STYLE_ID` keeps `top-right`.
- `BUFF_STYLE_ID` keeps `top-left`.
- `GOAL_STYLE_ID` moves to `bottom-right` — its own corner, since it stands the whole run exactly like
  a pinned timer does.
- `LOOT_STYLE_ID` moves to `top` — it has no standing board of its own, so it has no reason to hold a
  corner a standing board needs, and stacking with the record/achievement/dispel banners there is
  exactly the harmless case above.
- `RECORD_STYLE_ID` and `ACHIEVEMENT_STYLE_ID` are unchanged (`top`).

**`DebuffOverlay` redirects only its own unconfigured fallback**, in the component, to a corner of its
own (`bottom-left`) — not by giving debuffs a built-in style, but by using a different position for the
*stack key* when a row has picked no style, while still resolving its colour from `BUFF_STYLE_ID`
exactly as before. A row that names an explicit saved style — its own, or a picked one — still lands
exactly where that style says, same as everywhere else in the app; only the shared, un-set default
moved. This stays local to `DebuffOverlay.tsx` rather than becoming a seventh `AlertSource`: see
rejected alternatives.

This is presentation-only. Nothing about how a style is resolved, edited, or listed in the Alerts tab
changed — two `position` literals in `alert-styles.ts`, and one small placement override with no
data-model consequence.

Rejected alternatives:

- **A seventh, sticky "Crowd control" `AlertSource`**, with its own built-in style id, matching how
  every other feature gets a discoverable, restylable row in the Alerts tab. Rejected: `KnownBuff`
  carries exactly one `styleId`, shared by its on-you and on-enemy instances — there is no per-debuff
  config to point a symmetric source at. Building one would need `styleUse`'s wearer count to divide a
  single `KnownBuff` between two features it now wears at once, which would corrupt the "worn by" tally
  every other style's ✕ and rename rely on ([ADR 0120](./0120-a-feature-s-look-is-sticky.md)) — a
  real schema question (splitting a buff's config from a debuff's) that nothing else here is asking to
  open.
- **A fixed CSS offset on `.debuff-hud`** instead of a different corner. Rejected: a HUD's height is
  however many rows it currently has, so a guessed offset overlaps again the moment either list grows
  past it — the same reason 0099 rejected a fixed corner for the countdown HUD in the first place.

## Consequences

- Out of the box, a class running a farming goal while camping a named sees two boards, not one board
  smeared over the other; a crowd-control class juggling a mez while missing a self-buff sees the same.
- A player who explicitly picks a saved style for a spell — buff or debuff — is unaffected; only the
  shared, never-configured default moved corners.
- All six presets are now spoken for by a stock feature: `top` (record, achievement, loot, and every
  plain cast-alert rule), `top-right` (spawn), `top-left` (buff), `bottom-right` (goal), `bottom-left`
  (debuff's default only), and `center` still open. A seventh stock source, or a real per-debuff style,
  will have to either share deliberately or take the one open corner.
