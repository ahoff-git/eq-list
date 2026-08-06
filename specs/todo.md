# Todo

Open work only. Delete an item when it's done and record the outcome where it belongs (ADR, README,
or code). Features that are **built but await a real run** (in-game, packaged, or two clients) live
in the **[manual QA checklist](./testing/manual-qa.md)**, not here.

_Distribution wiring:_

- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download → `/releases/latest`,
  Launch → `eqlist://open`) and the Download target is populated by CI. Remaining: **host** the static
  page somewhere (e.g. GitHub Pages). Optional: point Download straight at
  `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown publisher".
  Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.

_Ready to build (decided, not started):_

- **Damage per mana.** eqlwiki states a spell's mana cost — verified, `Mana 7` in
  `fixtures/wiki/spell-burst-of-fire.html` — so this is a wiki lookup, not OCR. One
  wrinkle: cost is per *rank*, and `spellName()` strips the rank to make cast and damage
  lines agree, so the rank needs carrying alongside the canonical name (it's still in `raw`).
_Next up:_

- **Share item prices with peers.** Coin per mob now pools like a drop rate, but a vendor
  price doesn't — it's derived from your own auto-sells
  ([ADR 0047](./decisions/0047-money-is-copper-in-two-ledgers.md)). A price is the *easiest*
  thing to pool (it's identical for everyone, so one observation settles it) and would fill in
  the trash you've never happened to auto-sell. Needs a place in the observation payload.
- **Mark undocumented drops in the mob panel too.** The Hunt tab now reconciles wiki claims
  against your kills ([ADR 0025](./decisions/0025-observation-over-the-wiki.md)); the 📖 panel
  shows observed rates but doesn't yet say which of them the wiki has never heard of. Same
  module, one more lookup.
- **A "what this build changed" list.** Undocumented drops are the app discovering things no
  reference knows. Pooled across the room that's a genuinely new dataset — worth surfacing
  somewhere deliberate rather than only per mob.
- **Harden our bootstrap client** (`createHttpBootstrapClient`, `src/lib/awari/net.ts` — awari
  ships no HTTP client, so this one is ours). Two gaps found while reviewing the ICE work
  ([ADR 0046](./decisions/0046-our-own-ice-servers-not-peerjs-defaults.md)), neither yet fixed:
  - **`registerHint`'s response is discarded.** The protocol returns
    `registered | not-found | incompatible`; we `await fetch(...)` and drop it. Core calls this
    immediately after a peer becomes genesis leader, so a hint that *didn't* register leaves
    that client believing it leads a room nobody can resolve — which is exactly the
    "two clients never met" symptom [ADR 0028](./decisions/0028-peer-networking-verified-and-repaired.md)
    mitigated with jittered rejoins. Worth checking whether this fails silently **before**
    tuning those delays again.
  - **No `res.ok` check and no timeout on `resolve`.** A 5xx or HTML error page makes
    `res.json()` throw, or yields a body with no `contacts`, which core feeds straight into
    `tryContacts`. The user gets one `log.warn` and a stuck toggle, with no way to tell
    "bootstrap is down" from "nobody's online". A hung request never aborts.

_To discuss:_

- **OCR beyond item lookup — mostly settled.** Ruled out for the **experience bar** (the
  log's gains plus a level-up baseline already solve it exactly, see
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md)) and for **mana
  cost** (the wiki has it, above). **Health** is now *inferred* from what you survive and
  what kills you ([ADR 0018](./decisions/0018-inferred-max-hit-points.md)), so the only
  remaining prize is a live health *trace* rather than a maximum — worth deciding whether
  that's wanted, given it needs a user-calibrated screen region per UI layout, is fragile
  across resolutions and UI mods, may capture nothing in exclusive fullscreen, and a
  confidently wrong reading is worse than a blank.
- **Ask-the-user, applied elsewhere.** `AskValue` +
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md) established the
  pattern (hover for why, click to fill in) and it now backs two figures: experience into
  the level, and maximum health. Worth a look for other gaps — resist rate targets? gear
  goals? — rather than inventing new one-off inputs.
- **Kill heatmap — what's left.** Recording, the confidence marker, the filtered map layer, the
  kill list and peer sharing all ship ([ADR 0023](./decisions/0023-kill-heatmap.md)). Remaining:
  - **The `/loc` nag.** This is the load-bearing piece: a real 13,000-line log yielded 323
    kills and **six** positions worth believing, because `/loc` was typed nine times across
    several evenings. Ask for one when the camp looks to have changed (the `AskValue` pattern
    fits), and the map fills in.
  - **Retro-scoring.** Confidence is fixed when the kill is recorded, but the evidence is
    stored — a later `/loc` close to the earlier one could raise confidence for the kills in
    between, which is exactly the "they can only go so far so fast" argument.
  - **Spawn points, not just roam areas.** A roam area is the centroid and spread of where a
    mob died. With enough fixes, clusters would separate individual spawn points from a
    wandering path — the data is already stored, this is an analysis question.
  - **Group-mates' kills.** A group-mate's killing blow is indistinguishable from a stranger's
    in the log, so those kills only count towards a drop rate once you loot the corpse
    ([ADR 0027](./decisions/0027-only-your-kills-count.md)). Telling them apart means asking
    who was damaging the mob, which the kill log can't see — the damage tracker can. Worth
    doing if grouping turns out to be common; it needs the two to talk.
  - **Items per kill, alongside the drop chance.** `drops` counts kills that produced an item,
    which is the right numerator for a probability but throws away the stack size — a line
    saying "You looted 2 Spiderling Eye" counts once. For a stackable trash drop the useful
    figure is items-per-kill. It's a second number, not a correction, and it changes the shared
    observation shape, so it wants deciding rather than sneaking in.
- **Setting: split the meter by mode by default.** The per-stance / per-invocation data is
  already tracked and shown on hover
  ([ADR 0020](./decisions/0020-split-by-stance-and-invocation.md)). Some players will want
  those as real rows all the time — a Settings toggle, no new data needed.
- **Loot tab — an ignore list, and highlighting worth the name.** The split views, filters and
  sortable columns now ship ([ADR 0058](./decisions/0058-a-ledger-needs-filters-and-a-column-to-sort-by.md)),
  and the only highlight rule is still "on your shopping list". Two things left, both now filter
  questions rather than new mechanisms: an **ignore list** (trash you never want to see again —
  persisted, unlike the per-window filters), and the broader rule **"used by a quest in my level
  range in this zone"**, which needs the wiki's quest data per item and a level to compare against.



