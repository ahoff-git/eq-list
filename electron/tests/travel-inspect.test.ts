/**
 * "It tells me to run everywhere" — the travel row of the setup check
 * ([ADR 0340](../../specs/decisions/0340-a-setup-check-may-offer-a-fix-it-can-prove.md)).
 *
 * Pinned here is the router half: `inspect` must tell a **stale stored graph** (which a rebuild
 * mends) from a **pack with no rings or spires** (which it can't), and `rebuild` must actually mend
 * the first. The wording is the probe's, and is pinned in `self-check.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createZoneNamer, listSources } from "../eq-maps";
import { createTravelRouter } from "../travel-graph";
import { setAppVersion } from "../json-store";

const GRAPH_CACHE = "travel-graphs.json";

function tempInstall(): { logDir: string; mapsDir: string; cacheDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-travel-inspect-"));
  const mapsDir = path.join(root, "maps");
  const logDir = path.join(root, "Logs");
  const cacheDir = path.join(root, "userData");
  for (const dir of [mapsDir, logDir, cacheDir]) fs.mkdirSync(dir);
  return { logDir, mapsDir, cacheDir };
}

/** A map file with some geometry and the given labels (`to Lesser Faydark`, `Druid Ring`). */
function writeMap(dir: string, short: string, labels: string[]): void {
  const lines = ["L 0, 0, 0, 100, 100, 0, 0, 0, 0"];
  labels.forEach((label, i) => lines.push(`P ${i * 10}, ${i * 10}, 0, 0, 0, 240, 3, ${label.replace(/ /g, "_")}`));
  fs.writeFileSync(path.join(dir, `${short}.txt`), lines.join("\n"), "utf8");
}

/** Two zones joined by a border; `rings` adds a druid ring and a spire to each. */
function writePack(dir: string, rings: boolean): void {
  fs.mkdirSync(dir, { recursive: true });
  const extra = rings ? ["Druid Ring", "Spires"] : [];
  writeMap(dir, "gfaydark", ["to Lesser Faydark", ...extra]);
  writeMap(dir, "lfaydark", ["to Greater Faydark", ...extra]);
}

function router(cacheDir: string) {
  return createTravelRouter({ outOfEraZones: async () => [], namer: createZoneNamer(cacheDir), cacheDir });
}

test("a graph built just now is current, and says what it reaches", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(mapsDir, true);

  const check = await router(cacheDir).inspect(listSources(logDir).sources, undefined);
  assert.ok(check);
  assert.equal(check.current, true);
  assert.ok(check.reach.druid > 0 && check.reach.wizard > 0, "the rings and spires should be wired");
  assert.equal(check.drawn, undefined, "a pack that can teleport is routed over as drawn");
});

test("a stored graph that no longer matches the maps is stale, and a rebuild mends it", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(mapsDir, true);
  const { sources } = listSources(logDir);
  await router(cacheDir).graph(sources[0]);

  // Kept under a key that still matches — the case the key can't see — but with the networks gone.
  const file = path.join(cacheDir, GRAPH_CACHE);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  const kept = stored.folders[mapsDir].graph;
  kept.edges = kept.edges.filter((e: { from: string }) => !e.from.startsWith("net:"));
  fs.writeFileSync(file, JSON.stringify(stored), "utf8");

  const next = router(cacheDir);
  const stale = await next.inspect(sources, undefined);
  assert.ok(stale);
  assert.equal(stale.current, false);
  assert.equal(stale.reach.druid, 0, "what's routed over is the poisoned copy");
  assert.ok(stale.fresh.druid > 0, "and what the maps build still has the rings");

  await next.rebuild(sources[0]);
  const mended = await next.inspect(sources, undefined);
  assert.equal(mended?.current, true);
  assert.equal(mended?.reach.druid, stale.fresh.druid);
});

test("a drawn pack with no rings routes over an installed pack that has them", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(mapsDir, false); // the game's own folder: borders only
  writePack(path.join(mapsDir, "Brewall"), true);
  const { sources } = listSources(logDir);
  const travel = router(cacheDir);

  assert.equal((await travel.travelSource(sources, "stock"))?.id, "brewall");
  assert.equal((await travel.travelSource(sources, "brewall"))?.id, "brewall");

  const check = await travel.inspect(sources, "stock");
  assert.ok(check);
  assert.equal(check.pack.id, "brewall");
  assert.equal(check.drawn?.id, "stock", "the check says it borrowed, and from under which drawing");
  assert.ok(check.reach.druid > 0);
});

test("with no pack that can teleport, the drawn one stands", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(mapsDir, false);
  writePack(path.join(mapsDir, "Bare"), false);
  const check = await router(cacheDir).inspect(listSources(logDir).sources, "stock");
  assert.equal(check?.pack.id, "stock");
  assert.equal(check?.drawn, undefined);
  assert.equal((check?.reach.druid ?? 0) + (check?.reach.wizard ?? 0), 0);
});

test("a remembered pack that's gone falls back to the first, as the map window does", async () => {
  setAppVersion("1.0.0");
  const { logDir, mapsDir, cacheDir } = tempInstall();
  writePack(mapsDir, true);
  const check = await router(cacheDir).inspect(listSources(logDir).sources, "uninstalled");
  assert.equal(check?.pack.id, "stock");
});
