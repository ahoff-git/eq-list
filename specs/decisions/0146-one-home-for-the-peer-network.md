# 0146: One home for the peer network

## Status

Accepted

## Context

Peer networking arrived in [ADR 0011](./0011-awari-peer-location-sharing.md) as two checkboxes and a
name field in Settings, because that is what it was: a preference, plus a dot on the map. It has
since become a feature with a catalogue, three families of shareable data, a received tray, a
scoreboard comparison, a reconciliation pass and a connection light — and it acquired all of that
without anybody moving the original two checkboxes.

So it ended up living in three places at once:

- **Settings** — `connectPeers`, `shareLocation`, `playerName`, `bootstrapUrl`. The switch that turns
  the whole thing on, several screens away from everything it turns on.
- **The map toolbar** — ☣ (share kill locations) and 🔗 (share pins), which
  [ADR 0141](./0141-the-room-is-a-meeting-place.md) had already made *views of `settings.share`*. Two
  switches for one decision, in a different window from the list of the other eight.
- **The Peers tab** — everything else.

That is one subject with three homes, and the cost is not tidiness. It is that **every question about
it starts with "where is that?"** — including the questions people ask when it is broken, which is
when they can least afford the detour. Troubleshooting the room meant reading a light in one tab, a
bootstrap URL in another, and two share toggles in a window that may not even be open.

The map's toggles were the sharpest case, because they were pure duplication: flipping ☣ and flipping
*Kill positions* in the Peers tab wrote the same setting. Two controls for one fact is one control
that will eventually disagree with itself.

## Decision

**A control lives exactly once, and it lives in the Peers tab.**

- Settings' four peer controls move there. `connectPeers` becomes the first thing in *Your
  connection*, beside the light that says whether it worked and the button that retries — the three
  are only ever read as a set. `bootstrapUrl` goes behind a `<details>`, present and findable but out
  of the way of things people actually touch, and says what blank means rather than looking like a
  gap. Settings keeps nothing and its header comment says where it went, exactly as it does for
  Alerts.
- The map toolbar's ☣ and 🔗 are **removed**, not moved: their destination already existed.
- `shareLocation` joins *What you share*, above the ten kinds and in a block of its own, because it
  is the one thing that is **broadcast continuously at everybody** rather than handed over on
  request. Listing it with the others would quietly imply it behaves like them, and ADR 0141 keeps
  them apart for exactly that reason. It is also the one share that genuinely needs the game running,
  and says so.

**A view may live where it is needed; the control behind it may not.**

The map keeps its 👥 *Connected users* panel, and this is the one place the rule is not "move it".
The reason is not that it is map-flavoured — it is that the map is an **always-on-top overlay you use
while the game is full-screen and the main window is hidden**, which is precisely when a tab is no
use. Telling somebody mid-camp to alt-tab to a tab to see who is nearby would be worse than the
scatter this ADR removes. So it stays, narrowed to a pure view: no toggles, nothing to ask anybody
for, and its empty state now names the Peers tab as where you connect and troubleshoot.

What made that affordable is that the one thing the map's list could do and the tab could not —
**click a peer's zone to go and look** — the tab can now do too, via `map.openAt`. Nothing was lost
by removing the toggles from that window.

## Consequences

- One screen answers every question about the peer network, including "why isn't this working",
  which was the question the scatter hurt most.
- **Two controls became one in two places**, so the class of bug where a map toggle and a tab toggle
  disagree is gone by construction rather than by care.
- The Peers tab is now long — five sections. That is the honest size of the feature, and the
  alternative was the size it looked before, which was a lie. If it grows again the split to reach
  for is *within* the tab, not back out across windows.
- Somebody who knows where the old switches were will not find them. Settings' header comment says
  where they went, and the map's users panel names the tab; there is no redirect in the UI itself,
  which matches how Alerts was moved.
- **`shareLocation` is the one share that needs EverQuest running**, and saying so on its own row is
  the first time that has been stated anywhere. Everything else in the room works with the game shut
  ([ADR 0145](./0145-a-room-checks-itself-and-needs-no-game.md)), and the inconsistency was
  confusing precisely because the two lived apart.
- The rule generalises, and is the part worth keeping: **duplicate a view when the reader is
  somewhere a control cannot follow them; never duplicate the control.**
