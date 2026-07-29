# Todo

Open work only. Delete an item when it's done and record the outcome where it
belongs (ADR, README, or code).

_Needs a real run to confirm (built, typechecked, unit-tested, but not yet exercised
in-game):_

- **Damage meter, live.** The parser was validated against a whole real log (0 unmatched
  combat lines) and the tracker against that log's numbers, but confirm in-game: the
  Damage tab fills while fighting, "This fight" flips to "Last fight" after a lull, your
  and your pet's rows are the highlighted ones, and DPS looks sane for a long fight.
  See [ADR 0014](./decisions/0014-damage-meter-from-the-log.md).
- **Camp analytics, live.** Confirm in-game: XP/hour and **time to level** (the tile asks
  for your current XP% on first use, then keeps itself current and resets when you level),
  **downtime** looking plausible for a real session, the per-mob table ranking sensibly,
  and the per-zone table filling in as you move camps. Also the Damage tab's additions:
  the per-second sparkline, the death recap, pet share, the ★ personal-best flag, and
  **Copy**. See [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md).
- **Spell table + history, live.** Confirm the **Spells** view fills as you cast (cast
  times land in the 1–3s range, resist % rises on a resistant mob, melee shows as its own
  row and the numbers add up to your total), and that **History** lists tonight's session,
  drills into individual fights, and is still there after restarting the app. Ranked
  spells ("Shock of Lightning VI") must appear as **one** row, not two. See
  [ADR 0016](./decisions/0016-combat-history-and-spell-analytics.md).
- **Connected users, two clients.** With peer networking on, confirm the 👥 panel lists
  the other client (name from its `hello`, not a peer id), that a peer connected *without*
  location sharing still appears, that the row's zone button jumps the map there, and
  that leaving removes the row. See [ADR 0015](./decisions/0015-peer-presence-via-hello.md).
- **Ping animation + zone follow.** Confirm your own map click now shows an animated
  gold ping locally, and that actually zoning in-game clears a hand-picked zone override
  so the map follows you again.
- **Screengrab lookup, end-to-end.** Verify the `Ctrl/Cmd+Shift+L` flow: region
  select → capture → Tesseract OCR accuracy → fuzzy match. First OCR downloads the
  English model (needs network); tune the crop / text cleanup if accuracy is poor.
- **Packaged build.** Run `npm run dist` and confirm the installed app works:
  Tesseract assets load from `asar.unpacked`, the renderer loads over `app://` from
  the asar, and the `eqlist://` deep link launches/focuses the app.
- **Map window, real run.** Confirm the map window opens (🗺 button), draws the zone
  image, and plots the player dot on a `/loc` line. If a P99 map doesn't line up,
  re-tune it with the in-app calibration tool (enable Debug logging in the tray).
- **Peer networking (awari), real run.** With "Connect to the peer-to-peer network"
  on, confirm two clients join via the bootstrap-service; that clicking the map pings
  the other (a gold named marker in the *viewed* zone); that "Share my location" adds
  live green dots; that the connection now lives in the **main window** and survives
  **closing the map window** (reopening the map still shows peers); and that toggling
  "Connect" off leaves the room. Needs real network + WebRTC (unavailable in the dev
  sandbox). See [ADR 0012](./decisions/0012-awari-connection-owned-by-main-window.md).

_Zones:_

- **Add maps for the zones actually being played.** A real log showed visits to East
  Commonlands, The Estate of Unrest, New Sebilis Expedition and the EQL Tutorial —
  none of which have a bundled map, so the map window falls back to the P99 link. Each
  needs an image plus hand calibration (📐), see [map](./map/README.md).

_Distribution wiring:_

- **CI build — verify first run.** `.github/workflows/build-windows.yml` auto-builds the
  installer and publishes it to the rolling `latest` release on every push to `main`
  ([ADR 0013](./decisions/0013-ci-rolling-latest-windows-build.md)). The first run failed
  at the `npm test` gate (runner was on Node 20, which doesn't expand the test glob — now
  pinned to Node 22); the gate steps all pass locally on Node 22. Still to confirm on a
  real run: `electron-builder` succeeds on the runner, the `latest` tag moves, and
  `/releases/latest` resolves to the `.exe`. Not exercisable in the dev sandbox.
- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download →
  `/releases/latest`, Launch → `eqlist://open`) and the Download target is now populated
  by CI. Remaining: **host** the static page somewhere (e.g. GitHub Pages). Optional:
  point Download straight at `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown
  publisher". Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.

_Ready to build (decided, not started):_

- **Damage per mana.** eqlwiki states a spell's mana cost — verified, `Mana 7` in
  `fixtures/wiki/spell-burst-of-fire.html` — so this is a wiki lookup, not OCR. One
  wrinkle: cost is per *rank*, and `spellName()` strips the rank to make cast and damage
  lines agree, so the rank needs carrying alongside the canonical name (it's still in `raw`).
- **Fold `session-stats.ts` into `combat-stats.ts`.** Two main-process modules watch the
  log and count experience and kills; the combat tracker needs about five lines (gain
  count, solo/party split) to be a strict superset. Retires a module and its test, fixes
  the Session tab counting the pet's own death as a kill, and removes the split that
  already caused one bug — two "reset" buttons that meant different things, now papered
  over by `resetSession()`.
- **Text-size +/− buttons.** Not everyone wants the same size text. `overlay.fontScale`
  (0.8–1.6) already exists in settings and is applied by the renderer — this is about
  putting +/− controls somewhere obvious (titlebar next to the opacity toggle?) instead of
  only a Settings slider.

_Next up:_

- **Mark undocumented drops in the mob panel too.** The Hunt tab now reconciles wiki claims
  against your kills ([ADR 0025](./decisions/0025-observation-over-the-wiki.md)); the 📖 panel
  shows observed rates but doesn't yet say which of them the wiki has never heard of. Same
  module, one more lookup.
- **A "what this build changed" list.** Undocumented drops are the app discovering things no
  reference knows. Pooled across the room that's a genuinely new dataset — worth surfacing
  somewhere deliberate rather than only per mob.

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
- **Kill heatmap (from eq-map) — decided, not built.** Plot kills on the zone map, honest
  about the fact that it can only be as accurate as the player is. Agreed design:
  - Stamp each kill with the last `/loc`, the zone, and **how old that location was**.
  - **Confidence decays with staleness**: full weight when fresh, and past about a minute
    stop trusting the position — record the kill regardless, but plot it faintly or not at
    all, and say why.
  - A fresh `/loc` **restores** confidence retroactively: a player can only travel so far so
    fast, so a new fix close to the old one supports the kills in between; a distant one says
    they moved and those positions were guesses.
  - **Interpolate between the last two fixes** when both are known — position, elapsed time
    and the implied speed give a dead-reckoned guess for anything in between. It is a guess
    and must be labelled one; a kill logged while apparently moving is much weaker evidence
    than one logged while parked.
  - **Record generously, decide the visuals later**: store the position, both fixes, the
    ages, the implied speed and a confidence figure per kill. It's cheap, and it means the
    display can be reworked without re-collecting anything.

  **Built** — recording, the confidence marker, the filtered map layer, the kill list and
  peer sharing all ship ([ADR 0023](./decisions/0023-kill-heatmap.md)). What's left:
  - **The `/loc` nag.** This is now the load-bearing piece: a real log yielded 132 kills but
    only one position worth believing, because `/loc` was sent five times in an evening. Ask
    for one when the camp looks to have changed (the `AskValue` pattern fits), and the map
    fills in.
  - **Retro-scoring.** Confidence is fixed when the kill is recorded, but the evidence is
    stored — a later `/loc` close to the earlier one could raise confidence for the kills in
    between, which is exactly the "they can only go so far so fast" argument.
  - **Spawn points, not just roam areas.** A roam area is the centroid and spread of where a
    mob died. With enough fixes, clusters would separate individual spawn points from a
    wandering path — the data is already stored, this is an analysis question.
- **Setting: split the meter by mode by default.** The per-stance / per-invocation data is
  already tracked and shown on hover
  ([ADR 0020](./decisions/0020-split-by-stance-and-invocation.md)). Some players will want
  those as real rows all the time — a Settings toggle, no new data needed.
- **Loot tab — agreed, not built.** The latest drops and what became of each (kept, into a
  bag, into the tradeskill depot, auto-sold — the log distinguishes all four, see
  `src/shared/log-parser.ts`), with the same hover detail the List tab gives. Mostly a new
  panel over the existing loot feed; `LootEvent` already carries `qty` and the source.
  **Highlighting is wanted** — but it needs filters and an **ignore list** to be usable, so
  the first cut highlights what's on your shopping list (free, already known) and the
  broader rule ("used by a quest in my level range in this zone") comes with the filters.

_Recently settled (kept only as pointers):_

- Parse-once pipeline and the single session tracker shipped — see
  [ADR 0019](./decisions/0019-parse-once-and-one-tracker.md).

- Need to let the user know if a new version of the app is available and provide a link to it.