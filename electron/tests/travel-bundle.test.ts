/**
 * The travel graph shipped with the app
 * ([ADR 0341](../../specs/decisions/0341-a-travel-graph-ships-with-the-app.md)).
 *
 * Three things have to hold for shipping one to be safe: the file is regenerated when what it was
 * built from changes, closing an era at load comes to **the same graph** the build makes with that era
 * closed, and it's what routes use unless you've asked for your own maps — and then only when none of
 * them can teleport.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createZoneNamer, listSources } from "../eq-maps";
import { buildFromSource, createTravelRouter, curatedKey } from "../travel-graph";
import { setAppVersion } from "../json-store";
import { applyManual } from "../../src/shared/travel/manual";
import { MANUAL_TRAVEL } from "../../src/shared/travel/manual-links";
import { withoutZones } from "../../src/shared/travel/prune";
import { canTeleport, travelReach } from "../../src/shared/travel/reach";
import { BUNDLED_TRAVEL } from "../../src/shared/travel/travel-graph.generated";
import type { BundledTravel } from "../../src/shared/travel/types";

function tempInstall(): { logDir: string; mapsDir: string; cacheDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-travel-bundle-"));
  const mapsDir = path.join(root, "maps");
  const logDir = path.join(root, "Logs");
  const cacheDir = path.join(root, "userData");
  for (const dir of [mapsDir, logDir, cacheDir]) fs.mkdirSync(dir);
  return { logDir, mapsDir, cacheDir };
}

function writeMap(dir: string, short: string, labels: string[]): void {
  const lines = ["L 0, 0, 0, 100, 100, 0, 0, 0, 0"];
  labels.forEach((label, i) => lines.push(`P ${i * 10}, ${i * 10}, 0, 0, 0, 240, 3, ${label.replace(/ /g, "_")}`));
  fs.writeFileSync(path.join(dir, `${short}.txt`), lines.join("\n"), "utf8");
}

/** Three zones in a line, Crushbone at the end; `rings` puts a druid ring and a spire in each. */
function writePack(dir: string, rings: boolean): void {
  fs.mkdirSync(dir, { recursive: true });
  const extra = rings ? ["Druid Ring", "Spires"] : [];
  writeMap(dir, "gfaydark", ["to Lesser Faydark", "to Clan Crushbone", ...extra]);
  writeMap(dir, "lfaydark", ["to Greater Faydark", ...extra]);
  writeMap(dir, "crushbone", ["to Greater Faydark", ...extra]);
}

/** A bundle built the way the script builds one: every era open, the hand-authored pass applied. */
async function bundleFrom(dir: string): Promise<BundledTravel> {
  const source = { id: "fixture", label: "Fixture", dir, files: ["gfaydark", "lfaydark", "crushbone"] };
  const { graph } = await buildFromSource(source, [], createZoneNamer());
  return { label: "Fixture", curated: curatedKey(), graph: applyManual(graph, MANUAL_TRAVEL).graph };
}

test("the shipped graph was generated from today's hand-authored travel", () => {
  assert.equal(
    BUNDLED_TRAVEL.curated,
    curatedKey(),
    "manual-links.ts or the adjacency table changed since the bundle was built — run: npm run travel:bundle",
  );
});

test("the shipped graph can teleport, and carries nothing of the machine that built it", () => {
  assert.ok(canTeleport(travelReach(BUNDLED_TRAVEL.graph)));
  assert.equal(BUNDLED_TRAVEL.graph.source.dir, undefined);
});

test("closing an era at load comes to the same graph as building with it closed", async () => {
  const { mapsDir } = tempInstall();
  writePack(mapsDir, true);
  const source = { id: "fixture", label: "Fixture", dir: mapsDir, files: ["gfaydark", "lfaydark", "crushbone"] };

  const built = applyManual((await buildFromSource(source, ["Clan Crushbone"], createZoneNamer())).graph, MANUAL_TRAVEL).graph;
  const open = (await bundleFrom(mapsDir)).graph;
  const pruned = withoutZones(open, ["crushbone"]);

  assert.ok(open.nodes.some((n) => n.zones.includes("crushbone")), "the open graph should have had Crushbone");
  const sorted = <T>(xs: T[]) => xs.map((x) => JSON.stringify(x)).sort();
  assert.deepEqual(sorted(pruned.nodes), sorted(built.nodes));
  assert.deepEqual(sorted(pruned.edges), sorted(built.edges));
  assert.deepEqual(pruned.absent, built.absent);
});

/** A bundle from a pack with rings, kept outside the install so nothing local can stand in for it. */
async function ringedBundle(): Promise<BundledTravel> {
  const packDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "eql-bundle-src-")), "pack");
  writePack(packDir, true);
  return bundleFrom(packDir);
}

test("by default routes use the shipped graph, with the live era closed, and nothing is built here", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(path.join(mapsDir, "Brewall"), true); // even a pack that could teleport isn't read
  const fixture = await ringedBundle();
  const router = createTravelRouter({
    outOfEraZones: async () => ["Clan Crushbone"],
    namer: createZoneNamer(cacheDir),
    cacheDir,
    bundled: async () => fixture,
  });

  const { sources } = listSources(logDir);
  const picked = await router.travelSource(sources, "brewall");
  assert.equal(picked?.id, "fixture", "under the id of the pack it was built from, so its markers land there");
  assert.match(picked?.label ?? "", /shipped with the app/);
  const graph = await router.graph(picked!);
  assert.ok(!graph.nodes.some((n) => n.zones.includes("crushbone")), "the live era closes Crushbone in the bundle");
  assert.ok(graph.absent?.includes("crushbone"));

  const check = await router.inspect(sources, "brewall");
  assert.equal(check?.shipped, "default");
  assert.equal(check?.current, true, "nothing kept, so nothing to go stale");
  assert.ok(!fs.existsSync(path.join(cacheDir, "travel-graphs.json")), "no graph was built from the folder");
});

test("building from your own maps uses them, and falls back to the shipped graph only when none can teleport", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(mapsDir, false); // the game's own folder: borders only
  const fixture = await ringedBundle();
  const router = () => createTravelRouter({ outOfEraZones: async () => [], cacheDir, bundled: async () => fixture });
  const fromMaps = { fromMaps: true };

  const fallback = router();
  assert.equal((await fallback.travelSource(listSources(logDir).sources, "stock", fromMaps))?.id, "fixture");
  assert.equal((await fallback.inspect(listSources(logDir).sources, "stock", fromMaps))?.shipped, "fallback");

  // An installed pack that can teleport is the user's own survey, and wins once they've asked for it.
  writePack(path.join(mapsDir, "Brewall"), true);
  const local = router();
  assert.equal((await local.travelSource(listSources(logDir).sources, "stock", fromMaps))?.id, "brewall");
  assert.equal((await local.inspect(listSources(logDir).sources, "stock", fromMaps))?.shipped, undefined);
});
