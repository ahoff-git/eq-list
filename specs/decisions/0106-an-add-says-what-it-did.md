# 0106: An add says what it did

## Status

Accepted

## Context

Pressing **+ Add** on a search result did nothing visible. The add is real — an IPC call to the
store, which persists and broadcasts the new list — but every part of that happens somewhere the
player is not looking: the list is another tab, and the store is another process. The button did not
change, no line appeared, and the only confirmation available was to leave the search you were in the
middle of and go and count the rows. Pressing it twice because the first press "didn't take" is the
obvious response, and it is the one that quietly doubles a count, because
[`upsert`](../../electron/store.ts) bumps `needed` on a repeat rather than refusing it.

The figure worth reporting is not "added". It is **how many you now need**, which is the number the
list itself shows in parentheses and the only one that answers *can I stop farming this*. That number
is not a property of the press: an item can already be wanted by two other quests, a group can be set
to three runs, and a whole quest arrives as ten items at once. What was asked for and what the list
did therefore disagree in exactly the cases where a person most wants telling — and only the store
knows the answer, since only the store applies the rules.

## Decision

**Every add reads the list before and after itself, and says what changed.**

- The diff is a pure function over the two snapshots (`src/shared/list-add.ts`). An item counts as
  added when its **grand total needed went up**, computed through `grouping.ts`'s existing
  `groupByOrigin` → `itemTotals` — so runs are applied, a second claim on one item is one item, and
  the figure quoted is by construction the same one the row shows. Nothing is inferred from what was
  requested, so a repeat press ("+2 · 6 needed in total"), a whole quest ("2 items · 14 to collect in
  all") and an add that changed nothing ("already on your list") each report themselves honestly.
- The notice is a **toast** (`src/lib/toast.ts`, `components/Toasts.tsx`): bottom-right, ~3s,
  dismissable, capped at three, mounted by the window shell rather than by the panel — so it survives
  switching to the List tab to look. It sits **under the alert banners**, because a confirmation must
  never cover *your item just dropped* ([ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md)).
- **A notice is about a thing, and there is only ever one per thing.** Each add carries a key (the
  item, or the page) and a second notice with that key **replaces** the first in the slot it already
  held (`shared/toasts.ts`), arriving with a new id so the card remounts and its life starts again.
  Pressing + twice is one thing said twice, and the failure it avoids is specific: two cards up at
  once, one saying you need 1 and the other 2, of which only the newer is true. Replacing in place
  rather than at the bottom of the stack keeps the answer where the reader is already looking, and the
  cap is applied only when the stack actually grows, or a replacement could push an unrelated notice
  off the top.
- The button itself answers **immediately** (`AddButton` in `components/ui.tsx`): a tick and a pop the
  moment it's clicked. The two are deliberately different answers to different questions — the button
  says *this press landed*, which is true at once, and the toast says *what it did*, which the main
  process has to be asked.
- All six add buttons go through one module (`src/lib/addToList.ts`), which also absorbs the
  "add by title" rule the results list and the page view had each written for themselves.
- **The notice machinery is general, and deliberately not part of adding.** `shared/toasts.ts` holds
  the model and its rules (tones, the key/replacement rule, the clamped life), `lib/toast.ts` is a
  module-level **bus** — `showToast` is a plain function, not a hook or a context, so it can be called
  from a module several layers under a component, which is what a one-way announcement needs — and a
  window opts in by mounting `<Toasts />` once. Three invariants keep it safe to reach for anywhere: a
  toast is **read, never acted on**; it **always leaves by itself**; and it is **never the only place**
  something is said, so one raised in a window with no host is simply dropped rather than an error.
  Its second caller is `lib/clipboard.ts`: `Copy rule` and the meter's `Copy` were
  `void navigator.clipboard?.writeText(…)` — a promise nobody awaited over an API that is absent in
  some contexts, so a copy that never happened looked exactly like one that did.

## Consequences

- Adding is now a closed loop from anywhere in the app: search results, the results from your own log
  ([ADR 0103](./0103-search-can-answer-from-your-own-log.md)), a wiki page's buttons, and each
  component row.
- One extra IPC read per add (`list.get()` before the add). It is a local, in-memory object; the add
  it precedes was already a round trip.
- The wording lives with the arithmetic and is tested without a window
  (`electron/tests/list-add.test.ts`), so a change to how the list counts cannot leave the
  confirmation quoting a number the row disagrees with.
- The app now has a general place for a brief "that worked" — deliberately small: anything that must
  be *acted* on is a panel, not a toast. Adding a notice to a silent gesture is now one import and one
  call, and the two rules with edges in them (replacement vs the cap, the clamped life) are pinned in
  `electron/tests/toasts.test.ts` rather than restated per caller.
- Not addressed: an add still cannot be undone from the notice. Removing is a click on the List tab,
  and an undo would need the store to hand back what it changed rather than the whole list.
