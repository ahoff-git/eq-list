/**
 * render-check.mjs — render the views that show a held item at its level, and read what they print.
 *
 * `npm run test:render` compiles the renderer (tsconfig.render.json → .render-check/) and server-renders
 * real components with React's `renderToStaticMarkup`, fed by the same functions the app uses — the
 * dump parser, `bisPlan`, the peer share reader. Each check asserts the link text a player would see,
 * so "shown at its level" is proven on the rendered page, not only on the data behind it
 * (ADR 0316, ADR 0319). Server rendering runs no effects, so this covers the views that take their
 * data as props; the data-loading tabs are covered by `electron/tests/level-paths.test.ts`.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Module from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".render-check");
const require = createRequire(import.meta.url);

// The app imports `@/…` and stylesheets; resolve the one to the compiled tree and ignore the other.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(this, request.startsWith("@/") ? path.join(OUT, request.slice(2)) : request, parent, ...rest);
};
require.extensions[".css"] = () => {};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const load = (p) => require(path.join(OUT, p));
const h = React.createElement;

/** The text of every item link in the rendered markup. */
const links = (html) => [...html.matchAll(/class="link item-link[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);

const tsv = (rows) => rows.map((r) => r.join("\t")).join("\r\n");
const DUMP = tsv([
  ["Location", "Name", "ID", "Count", "Slots"],
  ["Fingers", "Moonstone Ring +4", "10150", "1", "11"],
  ["Primary", "Gnoll Slayer +3", "5417", "1", "11"],
  ["Bank1", "Backpack*", "32601", "1", "8"],
  ["Bank1-Slot1", "Bone Chips", "13073", "643", "11"],
]);

const { parseInventoryDump } = load("shared/game-export-dumps");
const { itemRows, NO_CRITERIA } = load("shared/items/item-search");
const { bisPlan } = load("shared/items/bis-plan");
const { NO_BIS_OPTIONS } = load("shared/items/bis-options");
const { shareKind } = load("shared/peers/peer-share");

const card = (title, lines) => ({ title, origin: "wiki", card: { title, lines }, sources: [], outOfEra: false });
const catalogue = itemRows([
  card("Gnoll Slayer", ["Slot: PRIMARY SECONDARY", "STR: +5", "Class: ALL", "Race: ALL"]),
  card("Moonstone Ring", ["Slot: FINGER", "STR: +3", "Class: ALL", "Race: ALL"]),
  card("Crown of Hunting", ["Slot: HEAD", "STR: +9", "Class: ALL", "Race: ALL"]),
]);
const plan = bisPlan({ rows: catalogue, inventory: parseInventoryDump(DUMP), criteria: { ...NO_CRITERIA, hideOutOfEra: false }, weights: { str: 1 } });

const checks = [
  {
    view: "Exports — inventory, by place",
    html: () => renderToStaticMarkup(h(load("app/components/exports/InventoryDumpView").default, { text: DUMP })),
    expect: ["Moonstone Ring +4", "Gnoll Slayer +3"],
  },
  {
    view: "Best in slot — Wear",
    html: () =>
      renderToStaticMarkup(h(load("app/components/items/BisWearTable").default, { plan, options: NO_BIS_OPTIONS, onOptions: () => {} })),
    expect: ["Gnoll Slayer +3", "Moonstone Ring +4"],
  },
  {
    view: "Best in slot — Hunt",
    html: () => renderToStaticMarkup(h(load("app/components/items/BisHuntTable").default, { hunt: plan.hunt, onSkip: () => {} })),
    expect: ["Crown of Hunting"],
  },
  {
    view: "Peers — Who has it",
    html: () => {
      const rows = shareKind("inventory").read([{ item: "Gnoll Slayer", count: 2, grade: 3, places: [], asOf: "2026-10-20T10:00:00.000Z" }], () => "id");
      const received = [{ peerId: "p1", kind: "inventory", from: "Bob", rows, rev: 1, at: Date.now() }];
      return renderToStaticMarkup(h(load("app/components/peers/PeerInventories").default, { received }));
    },
    expect: ["Gnoll Slayer +3"],
  },
  {
    view: "Kill list — a kill's drops, as looted",
    html: () => {
      const kills = [{ id: "k1", at: "2026-10-20T10:00:00", mob: "a gnoll", zone: "Blackburrow", mine: true, drops: ["Copper Amulet +2"] }];
      const { DEFAULT_KILL_FILTERS } = load("shared/kills/kill-filters");
      return renderToStaticMarkup(
        h(load("app/components/kills/KillList").default, { kills, filters: DEFAULT_KILL_FILTERS, onFilters: () => {}, showConfidence: false }),
      );
    },
    expect: ["Copper Amulet +2"],
  },
];

let failed = 0;
for (const c of checks) {
  let shown = [];
  try {
    shown = links(c.html());
  } catch (err) {
    console.log(`✖ ${c.view}: did not render — ${err.message.split("\n")[0]}`);
    failed++;
    continue;
  }
  const missing = c.expect.filter((t) => !shown.includes(t));
  if (missing.length) {
    console.log(`✖ ${c.view}: expected ${JSON.stringify(missing)}, rendered links ${JSON.stringify(shown)}`);
    failed++;
  } else {
    console.log(`✔ ${c.view}: ${c.expect.join(", ")}`);
  }
}
console.log(failed ? `FAIL — ${failed} of ${checks.length} views` : `PASS — ${checks.length} views render items at their level`);
process.exit(failed ? 1 : 0);
