# File layout

The renderer's three trees are organized **by domain**, not by flat naming convention.
`src/app/components/`, `src/shared/`, and `src/lib/` each have one subfolder per domain,
using the same domain name across all three — so "map" means the same thing in
`src/app/components/map/`, `src/shared/map/`, and `src/lib/map/`.

Domains: `aa`, `achievements`, `alerts`, `buffs`, `chrome`, `combat`, `faction`,
`gameclock`, `goals`, `items`, `kills`, `map`, `mob`, `peers`, `spells`.

A few of these aren't in the app's own tab list under that name:
- `chrome` — window chrome, app shell, settings, cross-tab navigation (titlebar
  buttons, NavBar/TabBar, SettingsPanel, CrashBoundary, toasts…), not GUI-framework code.
- `spells` and `aa` are split rather than folded into `items`, because the app's own
  framing is four parallel reference shelves (Items / Spells / Stances / AA — see
  `AAPanel.tsx`'s doc comment) — Stances rides along with Spells as the other
  non-equipment reference family.
- `goals` (timeboxed farming targets, ADR 0198/0199) and `buffs` (the Buffs tab) are
  each their own domain rather than being squeezed into `achievements`/`alerts`/`combat`
  — none of those were an honest fit.

**A file stays at a tree's top level only if it's genuinely generic and content-free** —
reused across unrelated domains with no domain knowledge baked in (`ui.tsx`,
`dataGridDefaults.ts`, `logging.ts`, `format.ts`, `hooks.ts`…). A component or module
that happens to be imported from many domains but *contains* domain-specific logic
(`ItemLink.tsx`, `ZoneTag.tsx`, `AlertStyleField.tsx`) lives in its domain folder
regardless of how widely it's imported — name and import-breadth are not the test,
content is.

`src/shared/map/`, `src/shared/travel/`, `src/shared/zones/`, `src/lib/map/`,
`src/lib/web/`, and `src/lib/awari/` predate this convention and already group their
own area; new domain files merge into them where they agree (e.g. `src/lib/map/`)
rather than growing a sibling folder.

**`electron/` is deliberately exempt** and stays flat at its own root — each file there
is already one bounded module (`combat-stats.ts`, `faction-log.ts`, `mob-knowledge.ts`…),
a convention chosen on purpose rather than the unstructured scatter the renderer had.

## See also
[architecture](./README.md)
