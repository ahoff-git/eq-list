# 0166: A panel setting belongs to the app, not to an origin

## Status

Accepted

## Context

Every remembered panel setting — the Hunt tab's zone, the map's layers, the Items tab's value weights
and its ticked zones — lives in `localStorage`, behind one hook (`usePersistentState`). That is the
obvious place for it and it works exactly as advertised.

It also loses your settings, and the reason is not a bug in the hook. **`localStorage` belongs to an
origin.** This renderer has two: a packaged launch serves it from `app://local`, and a launch against
the dev server serves it from `http://localhost:3000`. Chromium keeps a separate store per origin, so
a weight sheet typed under one is simply not there under the other. Confirmed in the on-disk store:
both origins are present, with the Items tab's keys written under each.

The report was "the value weights and dropdown selections should persist through reboot", and what
made it hard to credit at first is that the values *were* on disk, correctly, the whole time — under
the origin the user was not looking at. The same split would arrive again from a change of dev port,
or a move off the custom scheme.

There is also a second, milder reason: these settings are the app's data. Everything else the app
remembers is a JSON file in `userData` that a bug report can include and a user can back up.
`localStorage` is a LevelDB nobody can read.

## Decision

**A persisted panel setting is written to both `localStorage` and the main process, and the main
process wins on load.**

- **One key/value store in `userData`** ([ui-state.ts](../../electron/ui-state.ts)), deliberately
  untyped: the keys are the renderer's own (`storageKeys.ts`) and main has no business knowing what a
  "criterion" is. It has caps — key length, value size, key count — because a renderer bug must not be
  able to fill a disk.
- **`localStorage` is kept, not replaced.** It is synchronous, so it is what the first paint reads;
  main's copy arrives an IPC round trip later. Without it every panel would visibly snap from its
  defaults on every open.
- **Absent from main means "never written by this build"**, so the local copy stands and is mirrored
  up. That is the upgrade path: nobody's existing settings are lost, whichever origin they were
  stored under first.
- **One round trip per window, not per key.** A window holds a dozen of these hooks and they all want
  the same record.
- **The hook can inherit across a key bump** (`legacy: { key, migrate }`), for a setting whose stored
  shape can no longer be told apart from the one you want. The Items tab needed exactly this: "in era
  only" became the default, and a stored `false` from before that change is the same three characters
  as a deliberate `false`. The old value is carried over whole — nobody loses a zone list they spent
  a while ticking — with only the era flag reset.

## Consequences

**Settings survive a restart regardless of how the app is launched**, which is what was asked for and
what the previous arrangement could not promise.

**They are also legible.** `ui-state.json` sits beside every other store in `userData`, so a bug
report can carry it and a user can delete it to get their panels back to defaults.

**Every existing call site is unchanged.** The behaviour moved into the hook, so the map window, the
Hunt tab and everything else gained this without knowing.

**There are now two copies, and they can disagree.** Main wins, always, so the disagreement resolves
the same way every time — but a setting changed while the app is closed (by hand-editing either store)
will not necessarily be the one that takes.

**A write is an IPC call.** They are debounced to disk on main's side and coalesced per burst, so a
drag or a burst of typing is one write; the IPC itself is a few hundred bytes and happens on state
changes a user makes, not on a timer.
