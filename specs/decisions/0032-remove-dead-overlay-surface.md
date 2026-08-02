# 0032: Remove the retained-but-dead overlay/click-through surface

## Status
Accepted

## Context
When the app merged its two windows into one ([ADR 0009](./0009-single-window-with-tray.md)),
a few things were **kept even though they stopped being applied**, in case they were wanted
again: the `clickThrough` overlay setting (mouse pass-through, which 0009 explicitly notes is
"retained but no longer applied"), the `overlay.open` / `overlay.setClickThrough` bridge API
and their IPC channels/handlers, and `win.role()` / the `win:role` channel.

None of it was ever wired back up. A grep confirms there are **no callers**: nothing invokes
`overlay.open`/`setClickThrough`, nothing reads `clickThrough` (there is no `setIgnoreMouseEvents`
anywhere), no renderer calls `win.role()`, and `win:role` has no handler. What's left is API
surface that *reads* like a feature but does nothing — the exact "confusing clutter" a reader
has to rule out.

## Decision
Delete the dead surface:
- the `clickThrough` field from `OverlaySettings` and its store default;
- the `EqlApi.overlay` namespace (`open`, `setClickThrough`), the `overlay:open` /
  `overlay:setClickThrough` channels, and their `ipc.ts` handlers;
- `EqlApi.win.role`, the preload `role()` helper, and the `win:role` channel.

This **reverses the specific retention noted in ADR 0009** — 0009's core decision (one window
+ a tray) stands and is unchanged; only the "keep clickThrough around" note is undone.

If click-through is wanted later, it comes back as a *working* feature: wired to Electron's
`win.setIgnoreMouseEvents(true)` with a real Settings toggle, not a stored flag that goes nowhere.

## Consequences
- Less dead API surface; a reader no longer has to trace `clickThrough`/`overlay.open`/`role()`
  to discover they do nothing.
- Old `settings.json` files may still carry `overlay.clickThrough`; `deepMerge` ignores unknown
  fields, so they load fine and the stray key is dropped on the next save.
- `--eql-role` is still passed when windows are created (harmless), now only informational.
- No behavior change: nothing used any of this.
