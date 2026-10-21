/**
 * render-check.mjs — render every kind of view that shows an item or a spell, and read what it prints.
 *
 * `npm run test:render` compiles the renderer (tsconfig.render.json → .render-check/) and renders real
 * components two ways:
 *
 * - **Server-rendered** (`renderToStaticMarkup`) for views fed by props, built with the same functions
 *   the app uses — the dump parser, `bisPlan`, the peer share reader;
 * - **Mounted** in a jsdom browser for the tabs that load their own data, with `window.eql` a fake API
 *   that answers the calls a check cares about from fixtures and every other call with an empty value.
 *
 * Each check asserts the link text a player would see, so "shown at its level" (ADR 0316, ADR 0319) is
 * proven on the rendered page — a held item at its grade, a spell at your rank, a wiki name at +0.
 *
 * A view that throws prints three stack lines; `RC_STACK=1` prints them all.
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

// ── A browser, for the tabs that load their own data ──────────────────────────
// jsdom lays nothing out, so every element is given a size (a virtualised grid otherwise draws no
// rows). `window.eql` is a fake API: a check's fixtures answer the calls it cares about, and every
// other call resolves to EMPTY — an empty list that answers any property with another EMPTY and reads
// as 0 or "" — so a tab renders its empty state around the one thing being checked. No network and no
// timers, so nothing can keep the process waiting.
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const k of ["window", "document", "navigator", "HTMLElement", "Node", "Element", "getComputedStyle", "localStorage", "MutationObserver", "CustomEvent", "Event"])
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.ResizeObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const [prop, v] of [["clientWidth", 1200], ["clientHeight", 800], ["offsetWidth", 1200], ["offsetHeight", 800], ["scrollWidth", 1200], ["scrollHeight", 800]])
  Object.defineProperty(dom.window.HTMLElement.prototype, prop, { configurable: true, get: () => v });
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, width: 1200, height: 800, right: 1200, bottom: 800, toJSON() {} });

const ARRAY = new Set(["length", "map", "filter", "forEach", "reduce", "some", "every", "slice", "flatMap", "find", "findIndex", "includes", "join", "sort", "concat", "indexOf", "at", "flat", "toSorted", "push"]);
const EMPTY = new Proxy([], {
  get: (t, p) =>
    p === Symbol.toPrimitive ? (hint) => (hint === "string" ? "" : 0)
    : typeof p === "symbol" ? t[p]
    : p === "then" ? undefined
    : p === "toString" || p === "valueOf" ? () => (p === "toString" ? "" : 0)
    : ARRAY.has(p) ? t[p]
    : EMPTY,
});
function fakeApi(fixtures = {}) {
  const calls = new Set();
  const api = new Proxy({}, {
    get: (_t, group) =>
      new Proxy({}, {
        get: (_u, method) => {
          if (typeof method !== "string") return undefined;
          if (method.startsWith("on")) return () => () => {};
          const key = `${String(group)}.${method}`;
          return () => {
            calls.add(key);
            return Promise.resolve(key in fixtures ? fixtures[key] : EMPTY);
          };
        },
      }),
  });
  return { api, calls };
}
dom.window.eql = fakeApi().api;

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createRoot } = require("react-dom/client");
const load = (p) => require(path.join(OUT, p));
const h = React.createElement;

/** The text of every item link in server-rendered markup. */
const links = (html) => [...html.matchAll(/class="link item-link[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);

/** Mount a component in the browser with these API fixtures; the item links it shows once settled (past any debounce). */
async function mount(component, props, fixtures, settleMs = 150) {
  const { api, calls } = fakeApi(fixtures);
  dom.window.eql = api;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  try {
    await React.act(async () => root.render(h(component, props)));
    await React.act(async () => new Promise((r) => setTimeout(r, settleMs)));
    return { shown: [...el.querySelectorAll(".item-link")].map((e) => e.textContent), calls: [...calls] };
  } finally {
    await React.act(async () => root.unmount());
    el.remove();
  }
}

// ── Fixtures, built the way the app builds them ───────────────────────────────
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
const { DEFAULT_KILL_FILTERS } = load("shared/kills/kill-filters");

const card = (title, lines) => ({ title, origin: "wiki", card: { title, lines }, sources: [], outOfEra: false });
const catalogue = itemRows([
  card("Gnoll Slayer", ["Slot: PRIMARY SECONDARY", "STR: +5", "Class: ALL", "Race: ALL"]),
  card("Moonstone Ring", ["Slot: FINGER", "STR: +3", "Class: ALL", "Race: ALL"]),
  card("Crown of Hunting", ["Slot: HEAD", "STR: +9", "Class: ALL", "Race: ALL"]),
]);
const plan = bisPlan({ rows: catalogue, inventory: parseInventoryDump(DUMP), criteria: { ...NO_CRITERIA, hideOutOfEra: false }, weights: { str: 1 } });
const DROP = { id: 1, logId: 1, item: "Dragoon Dirk +2", qty: 1, source: "a gnoll", fate: "kept", at: "2026-10-20T10:00:00" };
const GRADED = /\s\+\d+$/;

const checks = [
  // ── Server-rendered: views fed by props ──
  {
    view: "Exports — inventory, by place",
    html: () => renderToStaticMarkup(h(load("app/components/exports/InventoryDumpView").default, { text: DUMP })),
    expect: ["Moonstone Ring +4", "Gnoll Slayer +3"],
  },
  {
    view: "Best in slot — Wear",
    html: () => renderToStaticMarkup(h(load("app/components/items/BisWearTable").default, { plan, options: NO_BIS_OPTIONS, onOptions: () => {} })),
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
      return renderToStaticMarkup(h(load("app/components/kills/KillList").default, { kills, filters: DEFAULT_KILL_FILTERS, onFilters: () => {}, showConfidence: false }));
    },
    expect: ["Copper Amulet +2"],
  },

  // ── Mounted: tabs that load their own data ──
  {
    view: "Loot tab — a graded drop",
    mounted: () => mount(load("app/components/items/LootPanel").default, {}, {
      "loot.recent": [DROP],
      "loot.dropsPage": { rows: [DROP], total: 1, tallies: { kept: 1, sold: 0, destroyed: 0, given: 0, unknown: 0 } },
    }),
    expect: ["Dragoon Dirk +2"],
  },
  {
    view: "List tab — an entry added by a graded name",
    mounted: () => mount(load("app/components/items/ListPanel").default, {}, {
      "list.get": { entries: [{ id: "e1", name: "Dragoon Dirk +2", needed: 1, obtained: 0 }], questRuns: {} },
    }),
    expect: ["Dragoon Dirk +2"],
  },
  {
    view: "Buffs tab — a buff you cast at a rank",
    mounted: () => mount(load("app/components/buffs/BuffPanel").default, {}, {
      "buffs.view": {
        active: [{ key: "mesmerize", spell: "Mesmerize", rank: "III", target: "a wild tiger", up: true, at: "2026-10-20T10:00:00", since: "2026-10-20T10:00:00", source: "cast", byYou: true, permanent: false }],
        lapsed: [],
        known: [],
        lexicon: true,
        now: "2026-10-20T10:01:00",
      },
    }),
    expect: ["Mesmerize III"],
  },
  {
    view: "Now → Overview — a buff that lapsed, at its rank",
    mounted: () => mount((p) => h(load("lib/chrome/nav").NavProvider, null, h(load("app/components/now/NowOverview").default, p)), {}, {
      "buffs.view": {
        active: [],
        lapsed: [{ key: "clarity", spell: "Clarity", rank: "II", target: "you", up: false, at: "2026-10-20T10:00:00", since: "2026-10-20T09:00:00", source: "cast", byYou: true, permanent: false, onEnemy: false }],
        known: [],
        lexicon: true,
        now: "2026-10-20T10:01:00",
      },
    }),
    expect: ["Clarity II"],
  },
  {
    view: "Search tab — a graded name finds its +0 page",
    mounted: () => mount((p) => h(load("lib/chrome/nav").NavProvider, null, h(load("app/components/items/SearchPanel").default, p)), { prefill: "Dragoon Dirk +2", onPrefillUsed: () => {} }, {
      "wiki.search": [{ title: "Dragoon Dirk", wikiPath: "Dragoon_Dirk" }],
      "zone.current": null,
    }, 1000),
    expect: ["Dragoon Dirk"],
    never: [GRADED],
  },
  {
    view: "Tradeskills tab — guide materials are wiki names at +0",
    mounted: () => mount(load("app/components/tradeskills/TradeskillsPanel").default, {}, {
      "log.exportRead": null,
      "zone.current": null,
      "tradeskills.progress": { character: "Kainos", skills: {}, rates: {}, scanning: false, crafting: EMPTY },
    }),
    expect: [],
    atLeast: 5,
    never: [GRADED],
  },
];

let failed = 0;
for (const c of checks) {
  let shown = [];
  let calls = [];
  try {
    if (c.html) shown = links(c.html());
    else ({ shown, calls } = await c.mounted());
  } catch (err) {
    console.log(`✖ ${c.view}: did not render — ${String(err?.stack ?? err).split("\n").slice(0, 3).join(" | ")}`);
    failed++;
    continue;
  }
  const missing = c.expect.filter((t) => !shown.includes(t));
  const wrong = (c.never ?? []).filter((re) => shown.some((t) => re.test(t)));
  const tooFew = c.atLeast !== undefined && shown.length < c.atLeast;
  if (missing.length || wrong.length || tooFew) {
    console.log(`✖ ${c.view}: missing ${JSON.stringify(missing)}${wrong.length ? `, must not show ${wrong}` : ""}${tooFew ? `, only ${shown.length} links` : ""}; rendered ${JSON.stringify(shown.slice(0, 12))}; calls ${calls.join(",")}`);
    failed++;
  } else {
    console.log(`✔ ${c.view}: ${c.expect.length ? c.expect.join(", ") : `${shown.length} links, none graded`}`);
  }
}
console.log(failed ? `FAIL — ${failed} of ${checks.length} views` : `PASS — ${checks.length} views show items and spells at their level`);
process.exit(failed ? 1 : 0);
