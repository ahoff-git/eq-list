/**
 * Black-box tests for a quest's walkthrough read as a tree of steps (ADR 0295), and for what a step's
 * links turn out to be once their pages are asked.
 *
 * Pinned against three real pages, one per shape: a nested "TLDR" walkthrough (Exotic Drinks), a
 * nested checklist (Coin of Tash), and a flat checklist under bold group labels (Tarton's Wheel).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { parseWikiPage } from "../wiki/parse";
import { parseQuestSteps } from "../wiki/quest-steps";
import { describeStepLink, stepLinkTitles } from "../../src/shared/quests/quest-steps";
import type { QuestStep } from "../../src/shared/types";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures", "wiki");
const page = (slug: string, title: string) =>
  parseWikiPage(title, `/${title.replace(/ /g, "_")}`, fs.readFileSync(path.join(FIXTURES, `${slug}.html`), "utf8"));

/** A step as the wiki writes it, links as [[Title]] or [[Title|label]] — readable assertions. */
const said = (step: QuestStep) =>
  step.parts.map((p) => (typeof p === "string" ? p : `[[${p.title}${p.label ? `|${p.label}` : ""}]]`)).join("");

test("a chain quest's walkthrough is one step per thing to get, with how as its sub-steps", () => {
  const steps = page("quest-exotic-drinks", "Exotic Drinks").steps ?? [];
  assert.deepEqual(
    steps.map(said),
    [
      "Get [[Kiola Nut]]",
      "Get [[Honey Jum]]",
      "Get [[Erud's Tonic]]",
      "Get [[Koalindl Fish]] (the easy way while avoiding brutal Qeynos faction hits)",
      "Get [[Barkeep Compendium]]",
      "Get [[Stein of Moggok]]",
    ],
    "the short walkthrough, not the long one's flat ingredient list as well",
  );
  const honey = steps[1].steps.map(said);
  assert.equal(honey.length, 2);
  assert.match(honey[0], /^Get 3 \[\[Honeycomb\|Honeycombs\]\] by killing Bixies/);
  assert.match(honey[1], /cast faction spell on \[\[Kizzie Mintopp\]\] then give her/);
  // A sub-quest is just a link in a step; what it is, is asked of its page.
  assert.equal(said(steps[3].steps[0]), "Do [[Frostbite's Fish]] to avoid faction hits and get many quickly.");
  assert.ok(steps[3].steps[2].parts.some((p) => typeof p !== "string" && p.title === "Qeynos" && p.label === "North Qeynos"));
});

test("a nested checklist keeps its pickups under the step that collects them, and its hand-ins in order", () => {
  const steps = page("quest-coin-of-tash", "Coin of Tash (Tashania)").steps ?? [];
  assert.equal(steps.length, 7);
  assert.equal(said(steps[0]), "Get [[Coin Pouch]] from [[Romar Sunto]] in [[The Temple of Solusek Ro]]");
  assert.equal(steps[1].steps.length, 10);
  assert.match(said(steps[1].steps[0]), /^Azia - \[\[Ak'anon\]\] - Near great wheel/);
  assert.match(said(steps[3]), /^Give \[\[Coin of Tash\]\] to \[\[Tarn Visilin\]\] in the library at \[\[High Keep\]\]/);
});

test("a flat checklist is still steps, grouped under its bold labels", () => {
  const steps = page("quest-tartons-wheel", "Tarton's Wheel").steps ?? [];
  assert.deepEqual(steps.map(said), ["Odus", "Antonica", "Faydwer"]);
  assert.deepEqual(steps[0].steps.map(said), ["Azia from [[Erud's Crossing]]"]);
  assert.equal(steps[1].steps.length, 7);
});

const linkOf = (a: { getAttribute(name: string): string | undefined }) =>
  a.getAttribute("href")?.replace(/^\//, "").replace(/_/g, " ");
const section = (heading: string, html: string) => ({ heading, els: parse(html).childNodes.filter((n) => n.nodeType === 1) as never[] });

test("a flat list outside a checklist is prose, not steps — and a table of contents is never a step", () => {
  assert.deepEqual(parseQuestSteps([section("Walkthrough", `<ul><li>Hand in <a href="/Bone_Chips">Bone Chips</a></li></ul>`)], linkOf), []);
  const toc = `<div class="toc"><ul><li>Walkthrough<ul><li>Alternatives</li></ul></li></ul></div>`;
  assert.deepEqual(parseQuestSteps([section("Walkthrough", toc)], linkOf), []);
});

test("an embedded item card is its link, and a link with no page is kept as its words", () => {
  const html = `<ul><li>Bring <div class="hbdiv"><a href="/Kiola_Nut">Kiola Nut</a><span class="hb">MAGIC ITEM Slot: NONE</span></div> to <a href="/index.php?action=edit">Gregor</a><ul><li>then wait</li></ul></li></ul>`;
  const [step] = parseQuestSteps([section("Walkthrough", html)], (a) => (a.getAttribute("href")?.startsWith("/index.php") ? undefined : linkOf(a)));
  assert.deepEqual(step.parts, ["Bring ", { title: "Kiola Nut" }, " to Gregor"]);
});

test("a step tree's links are gathered once each, in the order they're first named", () => {
  const steps = page("quest-exotic-drinks", "Exotic Drinks").steps ?? [];
  const titles = stepLinkTitles(steps);
  assert.equal(titles[0], "Kiola Nut");
  assert.equal(titles.filter((t) => t === "Gregor Nasin").length, 1);
  assert.ok(titles.includes("Frostbite's Fish") && titles.includes("Kizzie Mintopp"));
});

test("a linked NPC page says where it stands; any other page only what it is", () => {
  const npc = describeStepLink({ kind: "mob", card: { title: "Kizzie Mintopp", lines: ["Zone: Rivervale", "Location: (-310, 22)"] } });
  assert.deepEqual(npc, { kind: "mob", zones: ["Rivervale"], loc: { y: -310, x: 22 } });
  // A roamer's several zones are several places, and one spot can't stand for all of them.
  const roamer = describeStepLink({ kind: "mob", card: { title: "A Bixie", lines: ["Zone: Kithicor Forest, Misty Thicket", "Location: (1, 2)"] } });
  assert.deepEqual(roamer, { kind: "mob", zones: ["Kithicor Forest", "Misty Thicket"] });
  assert.deepEqual(describeStepLink({ kind: "mob", card: { title: "Clurg", lines: ["Level: 30"] } }), { kind: "mob" });
  assert.deepEqual(describeStepLink({ kind: "quest" }), { kind: "quest" });
  assert.equal(describeStepLink(null), undefined);
});
