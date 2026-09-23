# 0272: The debuff board's shared default gets a setting of its own

## Status

Accepted

## Context

A player asked to move the "mez timers" — `DebuffOverlay`, the standing list of what's still held on
whatever they're fighting (mez, root, charm, snare) — and found they couldn't: the Alerts tab lets you
place a cast-alert banner, the buffs-lapsing board, a spawn timer, a goal, anything with a saved style
at all, but not this one.

That's because it isn't wired to anything a player can reach. `DebuffOverlay` resolves colour from
`BUFF_STYLE_ID` (same as `BuffOverlay`'s missing-buffs list) but redirects its **position** to a
literal constant, `DEBUFF_DEFAULT_POSITION`, hardcoded in the component
([ADR 0213](./0213-every-stock-alert-claims-its-own-corner.md)). That redirect exists for a good
reason — without it, a crowd-control class's two standing boards land on the same pixels the moment
both are unstyled, which was the actual bug 0213 fixed — but "not configurable" was never the point,
just where the fix stopped. 0213 considered and rejected a full seventh `AlertSource` ("Crowd
control") for this, and that reasoning still holds: `KnownBuff` carries one `styleId`, worn by both a
spell's on-you and on-enemy instances (a beneficial buff cast on a charmed pet is both at once), so a
second, symmetric style id would need splitting a buff's config from a debuff's — a real schema change
nothing here is asking to open.

What 0213 didn't consider is a **plain position**, uninvolved with the style/wearer system at all.
The debuff board has nothing to configure but where it sits — same situation
[ADR 0190](./0190-the-pinned-clock-is-dragged-not-placed-from-settings.md) found for the pinned game
clock, which is why that one is a free-form drag rather than a style. This board isn't free-form (it's
not its own `SOLID` island the way the clock is; it's laid out by the same six-preset `AlertPositionValue`
vocabulary everything else already uses), but it shares the clock's other half of the answer: a
*position* setting needs no name, no wearer count, and nothing else asking to share it — just a value.

## Decision

**`CastAlertSettings` gains `debuffPosition?: AlertPositionValue`** — a plain field, not a style,
alongside `locations` and `displayId` (which are exactly this shape already: an overlay-placement
choice with nothing to do with the style/wearer machinery). `DEBUFF_DEFAULT_POSITION` moves from
`DebuffOverlay.tsx` into `alert-styles.ts` as an exported constant — still `bottom-left`, still the
shipped fallback — and `DebuffOverlay` now reads `ca.debuffPosition ?? DEBUFF_DEFAULT_POSITION` in its
place. A row that names its own saved style is unaffected either way; only the shared, un-set fallback
moved and is now the player's to move again.

The Alerts tab gets one new control for it — a position `<select>`, the same options
`AlertStyleFields`' own Position field offers (six presets plus any custom spots), sitting in the
"Alert style" section next to Custom spots and Monitor rather than inside the `ALERT_SOURCES` list:
it isn't a source, wears no colour or sound of its own, and putting it in that list would imply an
edit-in-place / fork story (`plan`, `applyStyleEdit`) that doesn't apply to a field nothing "wears".

## Consequences

- The debuff board can be moved to any of the six corners or a placed custom spot, same as everything
  else standing on the overlay — closing the actual gap the player hit.
- 0213's fix stays intact: out of the box, with nothing set, the board still defaults to `bottom-left`
  and still doesn't collide with `BuffOverlay`'s `top-left`.
- 0213's rejected seventh `AlertSource` stays rejected for the same reason as before — this doesn't
  reopen that question, since a plain position needs none of the wearer-count bookkeeping a style does.
- The setting is per-install, like `locations` and `displayId` — not shared with peers, which is right:
  where a player likes their own HUD is not a fact about the server (same call [ADR
  0190](./0190-the-pinned-clock-is-dragged-not-placed-from-settings.md) makes for the clock's pin).
