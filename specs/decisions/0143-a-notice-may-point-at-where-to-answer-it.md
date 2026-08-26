# 0143: A notice may point at where to answer it

## Status

Accepted

## Context

[`toasts.ts`](../../src/shared/toasts.ts) states three invariants, and the first is flat: **a toast
is read, never acted on** — "anything with a decision in it is a panel, or a dialog". That rule has
held for every notice the app raises, because every one of them has been an *answer*: the item went
on the list, the log was eaten, the style was saved. There is nothing to do about an answer.

[ADR 0141](./0141-the-room-is-a-meeting-place.md) produced the first thing that isn't one. A peer
switching on a share kind is an **offer**, and an offer is only worth anything if the person it is
made to finds out. The Peers tab knows — it lists every catalogue in the room — but the Peers tab is
one of eleven, and the moment that matters is the moment somebody at your camp turns their watch
rules on, which is exactly when you are looking at something else. Nothing else in the app is
positioned to say so: the status bar carries the log's state, the alert overlay is for things
happening in the game, and a dialog for "Bob is sharing his pins" would be an interruption out of all
proportion.

So the notice belongs in a toast, and the thing a reader wants to do about it — go and look — is a
click they now have to reconstruct: switch tab, find the peer, find the kind. Every one of those is
a step where a notice that has already faded stops being useful.

The invariant is worth reading for its *reasons* rather than its wording, because they point
different ways here:

- **"Anything with a decision in it is a panel."** Still right, and untouched: deciding whether to
  take somebody's rules — reading them, picking the ones you want, copying them onto your list —
  is a screenful of judgement and stays a screenful of judgement.
- **"A notice that has faded is a notice nobody can go back to."** Also still right, and it is the
  constraint rather than the objection: the offer is in the Peers tab whether or not the toast was
  seen, so the toast is not the only place it is said.

What the wording forbids and the reasons do not is the step *between* them: getting to the panel.

## Decision

**A toast may carry exactly one action, and that action may only ever be "go and look".**

- `ToastInput` gains an optional `action: { label, run }`. The card renders it as a plain labelled
  button; clicking it runs and dismisses, and clicking anywhere else still dismisses as before, so
  the gesture everyone already has keeps working.
- **The action is navigation, never a change.** It may open a tab, a panel, a window, a page — put
  the reader in front of the thing. It may not accept, apply, copy, delete, send or write anything.
  A toast is on screen for three seconds and vanishes; anything it could *do* would be a decision
  taken under time pressure by somebody who may not have finished reading, and there would be no
  record of it having been offered. Navigation has neither problem: the worst a mis-click can do is
  show you a tab.
- **It follows that the destination must still be reachable without the toast.** The action is a
  shortcut, so a notice whose action leads somewhere you could not otherwise get to would have made
  the toast load-bearing — which is the third invariant, unchanged.

**Peer offers are the first caller, and the noise rules are the interesting half.** A catalogue moves
whenever a count does, so announcing catalogues would mean announcing somebody's kill tally growing
all evening. What is announced is narrow:

- **Only a kind that is newly on offer** — not a revision moving, not a count changing. That is the
  event: somebody decided to share something they weren't sharing.
- **Only the kinds a person has to act on** (`authored` and `live`). Observations fetch themselves
  and pool themselves ([ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md)); a notice about
  one would be telling you about something already done, with nowhere to go.
- **One notice per peer, not per kind.** Somebody switching six toggles on is one decision on their
  end, and it should be one line on yours.
- **Once per person per session, per kind**, keyed by **display name** rather than peer id — a peer
  id is per-session and a dropped room re-joins under a fresh one
  ([ADR 0070](./0070-a-dropped-room-rejoins-itself.md)), so keying by id would re-announce the same
  people every time the network hiccuped.
- **Nothing at all while `connectPeers` is off**, and nothing for a peer we can't address — an offer
  from somebody no route reaches is a notice about something you cannot ask for.

The notice names the peer, counts what's new, and its action opens the **Peers** tab with that peer's
row picked out — because "who was it?" is the question a reader asks second, and a tab of eight
strangers does not answer it.

## Consequences

- The first invariant is narrowed rather than dropped: a toast is still never where a decision is
  *taken*. The wording in `toasts.ts` says so explicitly now, since the next person to read it will
  be looking at a card with a button on it.
- **Every future action is a judgement call against one line**: does this only put the reader in
  front of something? "View", "Show me", "Open the tab" pass. "Accept", "Add all", "Dismiss for
  ever" do not, however convenient they would be — and the convenient ones are exactly the ones that
  will be argued for.
- A peer who switches sharing on, off and on again in one session is announced once. Deliberate:
  the second announcement carries no information the first didn't, and somebody toggling switches
  while they read the tab should not be able to spam a room.
- The offer notice is **not** a delivery notice. Nothing tells you when what you asked for has
  arrived, because you are already looking at the tray when you ask — and a second toast per ask
  would double the noise of the feature that was meant to reduce it.
- Peers is now the second tab that talks about itself from outside (the first being the alert
  overlay). If a third arrives wanting the same, the pattern to copy is here, not in `page.tsx`.
