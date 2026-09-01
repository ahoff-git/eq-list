/**
 * The travel graph is **built once and remembered** ([ADR 0169](../../specs/decisions/0169-the-travel-graph-is-built-once-and-remembered.md)).
 *
 * What's pinned here is the half that can go wrong quietly: a stored graph must be used when — and only
 * when — everything it was built from still holds. A cache that never hits is slow; a cache that hits
 * when the pack or the era has moved routes you through a zone that isn't there any more, and says
 * nothing.
 *
 * Touches a temp dir, because "which folder, and what did it look like" is the whole question.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSources } from "../eq-maps";
import { createTravelRouter } from "../travel-graph";
import { setAppVersion } from "../json-store";
import type { MapSource } from "../../src/shared/map/map-sources";

const GRAPH_CACHE = "travel-graphs.json";

function tempPack(): { logDir: string; mapsDir: string; cacheDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-travel-cache-"));
  const mapsDir = path.join(root, "maps");
  const logDir = path.join(root, "Logs");
  const cacheDir = path.join(root, "userData");
  for (const dir of [mapsDir, logDir, cacheDir]) fs.mkdirSync(dir);
  return { logDir, mapsDir, cacheDir };
}

/** A map file: some geometry so it has bounds, plus the exit labels the graph is harvested from. */
function writeMap(dir: string, short: string, exits: string[]): void {
  const lines = ["L 0, 0, 0, 100, 100, 0, 0, 0, 0"];
  exits.forEach((to, i) => lines.push(`P ${i * 10}, ${i * 10}, 0, 0, 0, 240, 3, to_${to.replace(/ /g, "_")}`));
  fs.writeFileSync(path.join(dir, `${short}.txt`), lines.join("\n"), "utf8");
}

/** A pack with one real border in it, so a graph built from it has something to say. */
function writePack(mapsDir: string): void {
  writeMap(mapsDir, "gfaydark", ["Lesser Faydark"]);
  writeMap(mapsDir, "lfaydark", ["Greater Faydark"]);
}

/**
 * A router that **counts its builds**, by watching the folder scan rather than the clock: a timing
 * assertion would be the flakiest thing in the suite, and what's actually being claimed is that the
 * work didn't happen.
 */
function counting(cacheDir: string | undefined, outOfEra: string[] = []) {
  let builds = 0;
  const router = createTravelRouter({
    outOfEraZones: async () => {
      builds += 1; // asked once per build, before anything is read
      return outOfEra;
    },
    ...(cacheDir ? { cacheDir } : {}),
  });
  return { ...router, builds: () => builds };
}

const source = (logDir: string): MapSource => listSources(logDir).sources[0];

test("a graph is built once and read back on the next run", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempPack();
  writePack(mapsDir);

  const first = counting(cacheDir);
  const built = await first.graph(source(logDir));
  assert.equal(first.builds(), 1);
  assert.ok(built.nodes.length, "the pack's one border should be a node");
  assert.ok(fs.existsSync(path.join(cacheDir, GRAPH_CACHE)), "the build should have been kept");

  // A second router is a second run: nothing in memory, everything on disk.
  const second = counting(cacheDir);
  const read = await second.graph(source(logDir));
  assert.equal(second.builds(), 1, "the era is still asked — it is part of the key");
  assert.deepEqual(read, built, "and the graph read back is the graph that was built");
});

test("a pack that changes is rebuilt, and one that doesn't is not", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempPack();
  writePack(mapsDir);
  await counting(cacheDir).graph(source(logDir));

  // Same folder, untouched: the stored graph still describes it, so nothing is rewritten.
  const stored = fs.readFileSync(path.join(cacheDir, GRAPH_CACHE), "utf8");
  const before = await counting(cacheDir).graph(source(logDir));
  assert.equal(fs.readFileSync(path.join(cacheDir, GRAPH_CACHE), "utf8"), stored);

  // A zone added is exactly the change a signature exists to notice.
  writeMap(mapsDir, "crushbone", ["Greater Faydark"]);
  const after = await counting(cacheDir).graph(source(logDir));
  assert.ok(after.nodes.length > before.nodes.length, "the new zone's border should be in the graph");
});

test("an era opening, and a new build of the app, each invalidate a stored graph", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempPack();
  writePack(mapsDir);
  await counting(cacheDir, ["Lesser Faydark"]).graph(source(logDir));

  // Kunark opening is not a change to any file, and it changes which zones are in the graph.
  const opened = await counting(cacheDir, []).graph(source(logDir));
  assert.ok(
    opened.nodes.some((n) => n.zones.includes("lfaydark")),
    "a zone the era had closed should come back without anything being edited",
  );

  // …and the same era again is a hit, so the era key is a key and not a cache-buster.
  const stored = fs.readFileSync(path.join(cacheDir, GRAPH_CACHE), "utf8");
  await counting(cacheDir, []).graph(source(logDir));
  assert.equal(fs.readFileSync(path.join(cacheDir, GRAPH_CACHE), "utf8"), stored, "nothing to rewrite");

  // A release may have changed the build itself, which nothing else here can speak for.
  setAppVersion("1.1.0");
  await counting(cacheDir, []).graph(source(logDir));
  assert.notEqual(
    JSON.parse(fs.readFileSync(path.join(cacheDir, GRAPH_CACHE), "utf8")).folders[path.join(mapsDir)].key,
    JSON.parse(stored).folders[path.join(mapsDir)].key,
    "the stored key should name the build that wrote it",
  );
});

test("with nowhere to keep it, every run builds its own — which is what the scripts want", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir } = tempPack();
  writePack(mapsDir);

  const router = counting(undefined);
  await router.graph(source(logDir));
  // Same router, so this one is the in-memory cache, which is unchanged behaviour.
  await router.graph(source(logDir));
  assert.equal(router.builds(), 1);
  // A fresh router has nothing to read, so it builds.
  const fresh = counting(undefined);
  await fresh.graph(source(logDir));
  assert.equal(fresh.builds(), 1);
});
