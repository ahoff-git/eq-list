/**
 * The committed `tradeskills.generated.ts` — the review a hand edit or bad merge has to pass, the way
 * `aa-list.test.ts` reviews its own generated file — and the era judgement over it
 * (`tradeskill-era.ts`, ADR 0302).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEM_ERAS, OPEN_ERAS_AT_SCRAPE, TRADESKILLS } from "../../src/shared/tradeskills/tradeskills.generated";
import { eraShut, guidePath, judgeGuide, runsVerdict, skillVerdict, withoutShut } from "../../src/shared/tradeskills/tradeskill-era";
import type { GuideRun, Tradeskill, TradeskillGuide } from "../../src/shared/tradeskills/tradeskill-types";
import { ZONE_EXPANSIONS, outOfEraSet } from "../../src/shared/zones/expansions";

const NONE: ReadonlySet<string> = new Set();

/** A live out-of-era list with every zone of `expansion` shut — what the wiki says while it's closed. */
function shutting(expansion: string): ReadonlySet<string> {
  return outOfEraSet(ZONE_EXPANSIONS.find((e) => e.expansion === expansion)?.zones ?? []);
}

// ─── The committed data ─────────────────────────────────────────────────────────────────────────

const SKILL_NAMES = ["Alchemy", "Baking", "Blacksmithing", "Brewing", "Fletching", "Jewelcrafting", "Pottery", "Tailoring", "Tinkering"];

test("every tradeskill the wiki has a guide for is present, each with a guide", () => {
  const skills = TRADESKILLS.filter((t) => t.kind === "skill");
  for (const name of SKILL_NAMES) {
    const s = skills.find((t) => t.name === name);
    assert.ok(s, `no ${name}`);
    assert.ok(s.guides.length > 0, `${name} has no guide`);
    assert.ok(s.guides.every((g) => g.anchor && g.blocks.length), `${name} has an empty or anchorless guide`);
  }
});

test("the cultural pages are there and carry their era", () => {
  const cultural = TRADESKILLS.filter((t) => t.kind === "cultural");
  assert.ok(cultural.length >= 10, `only ${cultural.length} cultural pages`);
  assert.ok(cultural.every((c) => c.eras.length > 0), "a cultural page lost its era category");
});

test("a guide's runs are only text, links and era keys", () => {
  for (const s of TRADESKILLS) {
    for (const g of s.guides) {
      for (const b of g.blocks) {
        const runs = b.kind === "text" ? b.runs : b.kind === "list" ? b.items.flatMap((i) => i.runs) : b.kind === "table" ? b.rows.flat(2) : [];
        for (const r of runs) {
          if (typeof r === "string") continue;
          assert.ok(("link" in r && r.link && r.text) || ("era" in r && /^[a-z0-9]+$/.test(r.era)), `${s.name}: odd run ${JSON.stringify(r)}`);
        }
      }
    }
  }
});

test("the scrape saw the classic era open", () => {
  assert.ok(OPEN_ERAS_AT_SCRAPE.includes("classic"));
});

test("Jewelcrafting's velium stage is marked unavailable by the guide's own words", () => {
  const jc = TRADESKILLS.find((t) => t.name === "Jewelcrafting")!;
  const velium = jc.guides.flatMap((g) => g.blocks).find((b) => b.kind === "heading" && /velium/i.test(b.text));
  assert.ok(velium && velium.kind === "heading" && velium.unavailable, "the velium stage isn't flagged");
});

// ─── The era judgement ──────────────────────────────────────────────────────────────────────────

test("classic is always open; Luclin is never on this server", () => {
  assert.equal(eraShut("classic", NONE), undefined);
  assert.equal(eraShut("luclin", NONE), "future");
});

test("Velious is judged live: shut while its zones are, open the day they aren't", () => {
  assert.equal(eraShut("velious", shutting("The Scars of Velious")), "out-of-era");
  assert.equal(eraShut("velious", new Set(["somewhere else"])), undefined);
});

test("with no live list, an expansion falls back on the scrape's verdict", () => {
  assert.equal(eraShut("velious", NONE), OPEN_ERAS_AT_SCRAPE.includes("velious") ? undefined : "out-of-era");
});

test("an era the scrape didn't list as open is shut — the template's default is out", () => {
  assert.equal(eraShut("epicquests", NONE), OPEN_ERAS_AT_SCRAPE.includes("epicquests") ? undefined : "out-of-era");
  assert.equal(eraShut("no-such-era", NONE), "out-of-era");
});

test("a step is shut by an item it needs, a paragraph only by its own badge", () => {
  const velious = shutting("The Scars of Velious");
  const item = Object.entries(ITEM_ERAS).find(([, eras]) => eras.includes("velious"))?.[0];
  assert.ok(item, "no velious item in the committed data to test with");
  const runs = ["Make ", { link: item, text: item }];
  assert.equal(runsVerdict(runs, velious, true)?.why, "out-of-era");
  assert.match(runsVerdict(runs, velious, true)!.because, new RegExp(item));
  assert.equal(runsVerdict(runs, velious, false), undefined);
  assert.equal(runsVerdict([{ era: "velious" }], velious, false)?.why, "out-of-era");
  assert.equal(runsVerdict([{ era: "classic" }, { link: "Silver Bar", text: "Silver Bar" }], velious, true), undefined);
});

test("a cultural page is shut by its own era", () => {
  const page: Tradeskill = { name: "Dwarf", title: "Cultural Tradeskills: Dwarf", kind: "cultural", eras: ["luclin"], guides: [] };
  assert.equal(skillVerdict(page, NONE)?.why, "future");
  assert.equal(skillVerdict({ ...page, eras: [] }, NONE), undefined);
});

const GUIDE: TradeskillGuide = {
  name: "Leveling",
  anchor: "Leveling",
  blocks: [
    { kind: "heading", level: 1, text: "Silver", anchor: "Silver" },
    { kind: "list", items: [{ runs: ["Trivial 17"] }, { runs: [{ era: "luclin" }, "moon stuff"], children: [{ runs: ["under it"] }] }] },
    { kind: "heading", level: 1, text: "Velium", anchor: "Velium", unavailable: "Velium is not currently available" },
    { kind: "text", runs: ["Before continuing…"] },
    { kind: "heading", level: 2, text: "Deeper", anchor: "Deeper" },
    { kind: "table", header: ["A"], rows: [[["row"]]] },
    { kind: "heading", level: 1, text: "Gold", anchor: "Gold" },
    { kind: "table", header: ["Trivial", "Era"], rows: [[["146"], [{ era: "classic" }]], [["300"], [{ era: "luclin" }]]] },
  ],
};

test("without the shut parts: a shut line goes with its children, a shut heading with its subsection", () => {
  const { blocks, hidden } = withoutShut(judgeGuide(GUIDE, NONE));
  assert.deepEqual(
    blocks.map((b) => (b.kind === "heading" ? b.text : b.kind)),
    ["Silver", "list", "Gold", "table"],
  );
  const list = blocks[1];
  assert.ok(list.kind === "list");
  assert.equal(list.items.length, 1);
  const table = blocks[3];
  assert.ok(table.kind === "table");
  assert.equal(table.rows.length, 1);
  assert.equal(hidden, 3, "the luclin bullet, the velium stage and the luclin row");
});

test("a list or table left empty is dropped", () => {
  const guide: TradeskillGuide = { name: "g", anchor: "g", blocks: [{ kind: "list", items: [{ runs: [{ era: "luclin" }] }] }] };
  assert.deepEqual(withoutShut(judgeGuide(guide, NONE)).blocks, []);
});

test("the wiki link lands on the guide", () => {
  assert.equal(guidePath("Skill Alchemy", "Skill_Progression"), "/Skill_Alchemy#Skill_Progression");
  assert.equal(guidePath("Jewelcrafting"), "/Jewelcrafting");
});

// ─── What a step makes, where the guide only named its ingredients ─────────────────────────────

function jewelcraftingLines() {
  const jc = TRADESKILLS.find((t) => t.name === "Jewelcrafting")!;
  return jc.guides.flatMap((g) => g.blocks).flatMap((b) => (b.kind === "list" ? b.items : []));
}
const lineText = (runs: readonly GuideRun[]) => runs.map((r) => (typeof r === "string" ? r : "text" in r ? r.text : "")).join("");

test("Jewelcrafting's ingredient-only steps say what they make", () => {
  const silver = jewelcraftingLines().find((l) => /Trivial 17\b/.test(lineText(l.runs)));
  assert.deepEqual(silver?.makes, ["Silver Malachite Ring"]);
  const named = jewelcraftingLines().filter((l) => l.makes?.length);
  assert.ok(named.length >= 15, `only ${named.length} steps named`);
});

test("a step that already names its result is left as the guide wrote it", () => {
  const platinum = jewelcraftingLines().filter((l) => /Result:/.test(lineText(l.runs)));
  assert.ok(platinum.length > 0, "no Result: lines to check");
  assert.ok(platinum.every((l) => !l.makes), "a line with its own Result: got a second one");
});
