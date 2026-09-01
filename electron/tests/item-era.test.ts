/**
 * Which of an item's sources you can actually reach, on the server as it stands.
 *
 * The case that prompted this is pinned literally: McVaxius` Horn of War drops off five dragons, and
 * on a server that hasn't opened Kunark exactly one of them is a mob you could go and kill. The app
 * printed all five as if they were five ways to get it.
 *
 * Two properties matter as much as the answer itself, and both are here in both directions:
 *
 * - **Silence is not a refusal.** A source with no zone, or a zone cell that names no place, is
 *   unjudged — never marked and never cut. Quest rewards and crafted goods live there.
 * - **It fails open.** With no live era list, nothing temporary applies; the permanent table still does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eraCorpus, openZones, sourcesByEra, zoneShut } from "../../src/shared/item-era";
import { itemRows } from "../../src/shared/item-search";
import { outOfEraSet } from "../../src/shared/zones/expansions";
import type { CachedItem, ItemSource } from "../../src/shared/types";

/** The era as the server actually ran it when this was written: Kunark and Velious shut. */
const KUNARK_SHUT = outOfEraSet(["Dreadlands", "Emerald Jungle", "Skyfire Mountains", "Timorous Deep", "Kael Drakkel"]);

const drop = (where: string, detail?: string): ItemSource => ({ kind: "drop", where, detail });

/** The real page, as the cache holds it. */
const HORN_OF_WAR: ItemSource[] = [
  drop("Gorenaire", "Dreadlands"),
  drop("Severilous", "Emerald Jungle"),
  drop("Lady Vox", "Permafrost"),
  drop("Talendor", "Skyfire Mountains"),
  drop("Faydedar", "Timorous Deep"),
];

const cached = (title: string, sources: ItemSource[], extra: Partial<CachedItem> = {}): CachedItem => ({
  title,
  origin: "wiki",
  wikiPath: `/${title.replace(/ /g, "_")}`,
  sources,
  fetchedAt: "2026-09-01T12:00:00.000Z",
  ...extra,
});

test("of the five dragons that drop the Horn of War, one is in era", () => {
  const reach = sourcesByEra(HORN_OF_WAR, KUNARK_SHUT);
  assert.deepEqual(
    reach.filter((r) => !r.shut).map((r) => r.source.where),
    ["Lady Vox"],
    "Permafrost is the only one of the five you could set off for",
  );
  // The reachable one leads, because the reader's question is "so where do I go".
  assert.equal(reach[0].source.where, "Lady Vox");
  // …and the wiki's own ordering survives among the rest.
  assert.deepEqual(
    reach.slice(1).map((r) => r.source.where),
    ["Gorenaire", "Severilous", "Talendor", "Faydedar"],
  );
  for (const shut of reach.slice(1)) {
    assert.equal(shut.shut, "out-of-era");
    assert.equal(shut.why, "not in this era yet", "a marked row can say why it is marked");
  }
});

test("a zone the server will never have is refused permanently, and says so differently", () => {
  const [row] = sourcesByEra([drop("Some Alaran", "Argath, Bastion of Illdaera")], KUNARK_SHUT);
  assert.equal(row.shut, "future", "an era opening won't help — this is not a distinction to lose");
  assert.equal(row.why, "Veil of Alaris — not on this server");
});

test("nothing is marked without a live era list, but the permanent table still applies", () => {
  // Fail open: the list is a read that may not have arrived, and a page marking the wrong rows for a
  // frame is worse than one marking none.
  assert.deepEqual(
    sourcesByEra(HORN_OF_WAR).filter((r) => r.shut),
    [],
    "Kunark being shut is eqlwiki's business, and without its answer we make no claim",
  );
  assert.equal(zoneShut("Argath, Bastion of Illdaera"), "future", "but an expansion we don't run never opens");
});

test("a source that names no place is unjudged, not unreachable", () => {
  // The wiki's Zone cells hold the odd header row and the odd shrug. None of them can answer "which
  // place", so none of them may be *marked* as a place you can't go.
  for (const cell of [undefined, "", "  ", "Various Zones", "Unknown", "Confirmed Drop Zones:", "(ToV East mobs)"]) {
    assert.equal(zoneShut(cell, KUNARK_SHUT), undefined, `"${cell}" names no place to judge`);
  }
  const [row] = sourcesByEra([{ kind: "quest", where: "Journey Home" }], KUNARK_SHUT);
  assert.equal(row.shut, undefined, "a quest reward with no zone is a source, not a dead end");
});

test("openZones only ever removes, and keeps the order it was given", () => {
  assert.deepEqual(openZones(["Dreadlands", "Permafrost", "Lavastorm Mountains"], KUNARK_SHUT), [
    "Permafrost",
    "Lavastorm Mountains",
  ]);
  assert.deepEqual(openZones([], KUNARK_SHUT), []);
});

test("the Items corpus flags an item whose every zone is shut — the page category can't", () => {
  // The wiki's own flag is a *page category*, so it catches an item written up on a Velious page and
  // misses one that merely drops in two Kunark zones. That miss is most of them.
  const rows = itemRows([
    cached("Horn of War", HORN_OF_WAR),
    cached("Kunark Only", [drop("Gorenaire", "Dreadlands"), drop("Talendor", "Skyfire Mountains")]),
    cached("Crafted Thing", [{ kind: "recipe", where: "Smithing" }]),
  ]);

  const shown = eraCorpus(rows, KUNARK_SHUT, false);
  assert.deepEqual(
    shown.map((r) => !!r.item.outOfEra),
    [false, true, false],
    "one open zone keeps an item in era; none shuts it; no zones at all is unjudged",
  );
  assert.deepEqual(shown[0].zones, HORN_OF_WAR.map((s) => s.detail), "with the toggle off, nothing is taken away");

  const hidden = eraCorpus(rows, KUNARK_SHUT, true);
  assert.deepEqual(hidden.map((r) => r.item.title), ["Horn of War", "Crafted Thing"]);
  assert.deepEqual(
    hidden[0].zones,
    ["Permafrost"],
    "and the zones you can't reach leave the row, so they leave the Zone column and the Zone picker",
  );
});

test("a catalogue with nothing shut is handed back row for row", () => {
  // The corpus is rebuilt whenever the catalogue or the era changes, over eleven thousand rows; a row
  // that didn't change must not be copied, or every memo downstream of it is invalidated for nothing.
  const rows = itemRows([cached("Vox Thing", [drop("Lady Vox", "Permafrost")])]);
  const same = eraCorpus(rows, outOfEraSet([]), true);
  assert.equal(same[0], rows[0], "same object, not an equal one");
});

test("the page's own era flag still stands on its own", () => {
  // Zone evidence widens the judgement; it never overrules the wiki saying outright that a page is
  // for an era that isn't live.
  const rows = itemRows([cached("Tagged", [drop("Lady Vox", "Permafrost")], { outOfEra: true })]);
  assert.equal(eraCorpus(rows, KUNARK_SHUT, false)[0].item.outOfEra, true);
  assert.deepEqual(eraCorpus(rows, KUNARK_SHUT, true), [], "and it is still hidden by the toggle");
});
